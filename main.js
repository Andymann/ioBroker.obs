'use strict';

/*
 * Created with @iobroker/create-adapter v1.33.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const OBSWebSocket = require('/../../../../home/pi/node_modules/obs-websocket-js');
let obs;

// Load your modules here, e.g.:
// const fs = require("fs");
let parentThis;
let pingQuery;
let sActiveScene = '';

let objScenes = {};
let objSources = {}; //Holds all the available Sources. e.g.: objSources[0]['name']
let objSourceTypes = {}; //Possible SourceTypes. Might differ between operating systems

class Obs extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'obs',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));

		//this.on('error', this.onError.bind(this));
		parentThis = this;
	}



	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		this.log.info('config Hostname: ' + this.config.Hostname);
		this.log.info('config Port: ' + this.config.Port);
		this.log.info('config Password: ' + this.config.Password);


		/*
		For every state in the system there has to be also an object of type state
		Here a simple template for a boolean variable named "testVariable"
		Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
		*/
		/*
		await this.setObjectNotExistsAsync('testVariable', {
			type: 'state',
			common: {
				name: 'testVariable',
				type: 'boolean',
				role: 'indicator',
				read: true,
				write: true,
			},
			native: {},
		});
		*/
		this.createStates();

		// In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
		//this.subscribeStates('testVariable');
		// You can also add a subscription for multiple states. The following line watches all states starting with "lights."
		// this.subscribeStates('lights.*');
		// Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
		this.subscribeStates('*');

		/*
			setState examples
			you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
		*/
		// the variable testVariable is set to true as command (ack=false)
		//await this.setStateAsync('testVariable', true);

		// same thing, but the value is flagged "ack"
		// ack should be always set to true if the value is received from or acknowledged from the target system
		//await this.setStateAsync('testVariable', { val: true, ack: true });

		// same thing, but the state is deleted after 30s (getState will return null afterwards)
		//await this.setStateAsync('testVariable', { val: true, ack: true, expire: 30 });

		// examples for the checkPassword/checkGroup functions
		//let result = await this.checkPasswordAsync('admin', 'iobroker');
		//this.log.info('check user admin pw iobroker: ' + result);

		//result = await this.checkGroupAsync('admin', 'admin');
		//this.log.info('check group user admin group admin: ' + result);


		await this.connectOBS();

		//Die Reihenfolge ist nicht einheitlich. innerhalb connectOBS() wurde u.a. objSourceTypes mit Inhalt gefuellt
		//Daraus bauen wir jetzt Datenpunkte, die eine Steuerung des Volumes erlauben.

	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);
			this.disconnectOBS();
			callback();
		} catch (e) {
			callback();
		}
	}

	onError(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);

			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			//this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
			parentThis.changeState(id, state.val, state.ack);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === 'object' && obj.message) {
	// 		if (obj.command === 'send') {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info('send command');

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
	// 		}
	// 	}
	// }


	async createSourceListWithVolumeFader() {
		this.log.info('createSourceListWithVolumeFader():' + Object.keys(objSources).length);

		// objSources beschreibt die tatsaechlich vorhanden Objekte
		// objSourceTypes ist die Liste mit den Moeglichkeiten der jeweiligen Plattform.

		for (let i = 0; i < Object.keys(objSources).length; i++) {
			//parentThis.log.info('objSources ' + i + ' ' + objSources[i]['name'] + ' typeID:' + objSources[i]['typeId']);
			for (let j = 0; j < Object.keys(objSourceTypes).length; j++) {
				let string1 = objSourceTypes[j]['typeId'].toString();
				let string2 = objSources[i]['typeId'].toString();
				if (string1.localeCompare(string2) == 0) {
					//parentThis.log.info('objSources ' + i + ' ' + objSources[i]['name'] + ' hasAudio:' + objSourceTypes[j]['caps']['hasAudio']);
					if (objSourceTypes[j]['caps']['hasAudio'] == true) {
						//parentThis.log.info(objSources[i]['name'] + ' bekommt einen Volume-Fader');
						//Es ist technisch machbar, in OBS eine Quelle mit '.' im Namen zu haben (auch NUR '.'!).
						//Innerhalb ioBroker fuehrt das zu Problemen. deswegen wird alles nach einem Punkt in einem 
						//zusaetzlichen Attribut des Datenpunktes gespeichert.
						let dpName = objSources[i]['name'].toString().replace('.', '_');

						await this.setObjectAsync('Volume.' + dpName, {
							type: 'state',
							common: {
								name: objSources[i]['name'],	//kann Punkte etc. enthalten
								type: 'number',
								role: 'level',
								min: 0,
								max: 1,
								read: true,
								write: false
							},
							native: {},
						});

						//---- Um synchron mit OBS zu sein, fragen wir den aktuellen Wert ab und schreiben ihn 
						//---- in den Datenpunkt, bevor eine Subscription existiert.
						obs.send('GetVolume', {
							source: objSources[i]['name']
						}).then(data => {
							parentThis.log.info('createSourceListWithVolumeFader: getVolume auf ' + objSources[i]['name'] + '=' + data.volume);
							parentThis.setStateAsync(objSources[i]['name'], data.volume, true);
						}).catch(error => {
							parentThis.log.error('createSourceListWithVolumeFader():' + Object.values(error));
						});


						//---- eine definierte Subscription auf ienen State IST eine bessere Idee:
						//this.log.info('adding Subscription for state Volume.' + dpName);
						this.subscribeStates('Volume.' + dpName);
					}
					break;
				}
			}
		}


	}

	async createSceneList() {
		this.log.info('createSceneList()'/* + Object.values(objScenes)*/);

		let objStates = {};
		let options = [];

		for (let i = 0; i < Object.keys(objScenes).length; i++) {
			let opt = { 'value': i.toString(), 'label': objScenes[i]['name'] };
			options.push(opt);
			objStates[i] = objScenes[i]['name'];
		}

		// @ts-ignore
		await this.setObjectAsync('SceneList', {
			type: 'state',
			common: {
				name: 'Autogenerated List of Scenes',
				type: 'number',
				states: objStates,
				role: 'list',
				read: true,
				write: true,
				def: 'Szene 1'
			},
			// Next up: addOn for using the Selection Wdiget in HABPanel
			stateDescription: {
				options
			},
			native: {},
		});


		//----Die Liste ist jetzt synchron mit OBS, jetzt noch die aktuelle Scene setzen:
		let tmp = await this.getStateAsync('ActiveScene');
		parentThis.setStateAsync('SceneList', tmp.val, true);
	}

	async createStates() {
		this.log.info('createStates()');

		await this.setObjectAsync('Connection', {
			type: 'state',
			common: {
				name: 'Connection',
				type: 'boolean',
				role: 'indicator',
				read: true,
				write: false,
				def: false
			},
			native: {},
		});

		await this.setObjectAsync('ActiveScene', {
			type: 'state',
			common: {
				name: 'ActiveScene',
				type: 'string',
				role: 'text',
				read: true,
				write: false
				//def: false
			},
			native: {},
		});

		await this.setObjectAsync('ActiveProfile', {
			type: 'state',
			common: {
				name: 'ActiveProfile',
				type: 'string',
				role: 'text',
				read: true,
				write: false
				//def: false
			},
			native: {},
		});
	}


	getVersion() {
		// --- Todo. Wenn das steht, ... top
		this.log.info('getVersion()');
		obs.send('GetVersion').then(data => {
			parentThis.log.info('version:' + data.val);
		}).catch(error => {
			parentThis.log.error('getVersion(): Error:' + error.val);
		});
	}

	setPingSchedule() {
		this.log.info('setPingSchedule()');
		clearInterval(pingQuery);
		pingQuery = setInterval(function () {
			// parentThis.log.info('ping');
			obs.send('GetVersion').then(data => {
				//parentThis.log.info('Ping Version:' + Object.values(data));
			}).catch(error => {
				parentThis.log.error('Ping error. Disconnecting');
				parentThis.disconnectOBS();
			});
		}, 2000);
	}

	async connectOBS() {
		obs = new OBSWebSocket();
		this.log.info('connectOBS()');
		let tmp = await this.getStateAsync('Connection');
		if (tmp.val == false) {
			clearInterval(pingQuery);

			var connectInterval = setInterval(function () {
				obs.connect({ address: parentThis.config.Hostname + ':' + parentThis.config.Port }).then(() => {
					parentThis.log.info('connectOBS(): connected');
					parentThis.setStateAsync('Connection', true);
					clearInterval(connectInterval);
					parentThis.setPingSchedule();
					//return obs.send('GetAuthRequired');
					return obs.send('GetCurrentScene');
					//}).then(data => {
					//	parentThis.log.info('GetAuthRequired()' + data.authRequired + ' ' + data.challenge + ' ' + data.salt);

				}).then(data => {
					parentThis.log.info('Current Scene:' + data.name);
					parentThis.setStateAsync('ActiveScene', data.name);
				}).then(() => {
					return obs.send('GetCurrentProfile');
				}).then(data => {
					parentThis.log.info('Current Profile:' + data['profile-name']);
					parentThis.setStateAsync('ActiveProfile', data['profile-name']);
				}).then(() => {
					return obs.send('GetSceneList');
				}).then(data => {
					//parentThis.log.info('List of Scenes:' + data.scenes.length);
					for (var i = 0; i < data.scenes.length; i++) {
						objScenes[i] = data.scenes[i];
					}
					parentThis.createSceneList();
				}).then(() => {
					return obs.send('GetSourcesList');
				}).then(data => {
					for (let i = 0; i < data.sources.length; i++) {
						//parentThis.log.info('Sources List:' + i + ':' + data.sources[i].name + ' ' + data.sources[i].type + ' ' + data.sources[i].typeId);
						objSources[i] = data.sources[i];
					}
					//parentThis.log.info('Sources List Length:' + Object.keys(objSources).length);
				}).then(() => {
					return obs.send('GetSourceTypesList');
				}).then(data => {
					for (let i = 0; i < data.types.length; i++) {
						//parentThis.log.info('getSourceTypes List:' + i + ':' + data.types[i].displayName + ' ' + data.types[i].type + ' ' + data.types[i].typeId + ' hasAudio:' + data.types[i].caps.hasAudio);
						objSourceTypes[i] = data.types[i];
					}
					parentThis.createSourceListWithVolumeFader();
				}).then(() => {
					return obs.send('GetVolume', {
						source: 'Freestyler.mp3'
					})
				}).then(data => {
					parentThis.log.info('GetVolume:' + data.volume);
				}).then(() => {
					return obs.send('GetMute', {
						source: 'Freestyler.mp3'
					})
				}).then(data => {
					parentThis.log.info('GetMute:' + data.muted);
					//}).then(() => {
					//	return obs.send('SetVolume', {
					//		source: 'Freestyler.mp3',
					//		volume: 0.001
					//	})
					//}).then(() => {
					//	//----Technisch möglich, return: 1
					//	return obs.send('GetVolume', {
					//		source: 'Bild'
					//	})
					//}).then(data => {
					//	parentThis.log.info('GetVolume (Bild):' + data.volume);
				}).catch(error => {
					parentThis.log.error('connectObs():' + Object.values(error));
				});

			}, 5000);


			obs.on('SwitchScenes', data => {
				this.log.info('New Active Scene:' + data.sceneName);
				parentThis.setStateAsync('ActiveScene', data.sceneName, true);
				parentThis.setStateAsync('SceneList', data.sceneName, true);

			});

			obs.on('ProfileChanged', data => {
				this.log.info('New Active Profile:' + data.sceneName);
				parentThis.setStateAsync('ActiveProfile', data.profile, true);

			});

			obs.on('ScenesChanged', data => {
				this.log.info('Scenes changed Scene count:' + Object.keys(data.scenes).length);
				objScenes = {};
				for (let i = 0; i < Object.keys(data.scenes).length; i++) {
					//this.log.info('Scene ' + i.toString() + ' Name:' + data.scenes[i]['name']);
					objScenes[i] = data.scenes[i];//['name'];
				}
				this.createSceneList();
			});

			obs.on('SourceVolumeChanged', data => {
				// replacing . with _ to correspond with names of states
				let sStateName = data.sourceName.replace('.', '_');
				//this.log.info('Source Volume changed:' + sStateName + ':' + data.volume);
				parentThis.setStateAsync('Volume.' + sStateName, data.volume, true);
			});

			obs.on('SourceMuteStateChanged', data => {
				// replacing . with _ to correspond with names of states
				this.log.info('Source Mute changed:' + data.sourceName.replace('.', '_') + ':' + data.muted);
			});

			// You must add this handler to avoid uncaught exceptions.
			obs.on('error', err => {
				console.error('socket error:', err);
			});

		} else {
			this.log.info('connectOBS(): ady connected');
		}
	}

	async disconnectOBS() {
		this.log.info('disconnectOBS()');
		clearInterval(pingQuery);
		obs.disconnect();
		await this.setStateAsync('Connection', false);
		this.log.info('waiting 5 seconds before trying to reconnect');
		var x = setTimeout(function () {
			parentThis.connectOBS();
		}, 5000);
	}





	//----Ein State wurde veraendert. wir verarbeiten hier nur ack==FALSE
	//----d.h.: Aenderungen, die ueber Iobroker	 kommen.
	//----Wenn das Routing an der Hardware geaendert wird, kommt die info via parseMSG herein.
	changeState(id, val, ack) {
		this.log.info('changeState(). id:' + id + '  val:' + val + '  ack:' + ack);
		if ((ack == false) && (id.includes('SceneList'))) {
			// ---- ack == FALSE: Aenderung via ioBroker. val ist der INDEX der Scene
			//this.log.info('via ioBroker: neue Szene:' + objScenes[val]);
			this.log.info('via ioBroker: neue Szene:' + objScenes[val]['name']);
			obs.send('SetCurrentScene', {
				'scene-name': objScenes[val]['name']
			}).catch(error => {
				parentThis.log.error('SetCurrentScene(): Error:' + error.val);
			});
		}
		if ((ack == false) && (id.includes('Volume.'))) {

			parentThis.getObjectAsync(id).then((data) => {
				// das Attribut 'name' hat keine Regeln hinsichtlich Sonderzeichen, die 
				// fuer uns problematisch sind.
				this.log.info(data.common.name);
				obs.send('SetVolume', {
					source: data.common.name,
					volume: val
				}).catch(error => {
					parentThis.log.error('setVolume():' + Object.values(error));
				});

			});
		}
	}

}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Obs(options);
} else {
	// otherwise start the instance directly
	new Obs();
}