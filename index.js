var Service, Characteristic;
var ModbusRTU = require("modbus-serial");

module.exports = function (homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerAccessory("homebridge-systemair-modbus", "systemairModbus", Ventilation);
};

function Ventilation(log, config) {
	this.log = log;

	this.name = config.name;
	this.manufacturer = config.manufacturer || 'Systemair';
	this.model = config.model || 'VTR300';
	this.serial = config.serial || 'SN1';

	this.host = config.host || "10.0.0.153";
	this.port = config.port || 8234;
	this.slave = config.slave || 10;
	this.temperatureDisplayUnits = config.temperatureDisplayUnits || 0;

	this.targetTemperature = 20;
	this.currentTemperature = 20;
	this.targetHeatingCoolingState = 1;

	this.client = new ModbusRTU();
	this.client.connectTCP(this.host, { port: this.port });
	this.client.setID(this.slave);
}

Ventilation.prototype = {

	identify: function (callback) {
		this.log("Identify requested!");
		callback();
	},

	getCurrentHeatingCoolingState: function (callback) {
		this.client.readHoldingRegisters(351, 1)
			.then((response) => {
				this.currentHeatingCoolingState = response.data[0];
				this.log("Get currentHeatingCoolingState: %s", this.currentHeatingCoolingState);
				callback(null, this.currentHeatingCoolingState)
			})
			.catch(callback);
	},

	getTargetHeatingCoolingState: function (callback) {
		this.log("Get targetHeatingCoolingState: %s", this.targetHeatingCoolingState);
		callback(null, this.targetHeatingCoolingState);
	},

	setTargetHeatingCoolingState: function (value, callback) {
		this.log("Set targetHeatingCoolingState from %s to %s", this.targetHeatingCoolingState, value);
		this.targetHeatingCoolingState = value;
		callback();
	},

	getCurrentTemperature: function (callback) {
		this.client.readHoldingRegisters(213, 1)
		.then((response) => {
			this.currentTemperature = response.data[0] / 10;
			this.log("Get currentTemperature: %s", this.currentTemperature);
			callback(null, this.currentTemperature)
		})
		.catch(callback);
	},

	getTargetTemperature: function (callback) {
		this.client.readHoldingRegisters(207, 1)
		.then((response) => {
			this.targetTemperature = response.data[0] / 10;
			this.log("Get targetTemperature: %s", this.targetTemperature);
			callback(null, this.targetTemperature)
		})
		.catch(callback);
	},

	setTargetTemperature: function (value, callback) {
		let setPoint = value - 11;
		this.client.writeRegisters(206, [setPoint]);
		this.targetTemperature = value;
		this.log("Set targetTemperature: %s", value);
		callback();
	},

	getTemperatureDisplayUnits: function (callback) {
		this.log("getTemperatureDisplayUnits:", this.temperatureDisplayUnits);
		callback(null, this.temperatureDisplayUnits);
	},

	setTemperatureDisplayUnits: function (value, callback) {
		this.log("setTemperatureDisplayUnits from %s to %s", this.temperatureDisplayUnits, value);
		this.temperatureDisplayUnits = value;
		callback();
	},

	getName: function (callback) {
		this.log("getName :", this.name);
		callback(null, this.name);
	},

	getServices: function () {

		this.informationService = new Service.AccessoryInformation();
		this.informationService
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.model)
			.setCharacteristic(Characteristic.SerialNumber, this.serial);

		this.service = new Service.Thermostat(this.name);
		this.service
			.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
			.on('get', this.getCurrentHeatingCoolingState.bind(this));

		this.service
			.getCharacteristic(Characteristic.TargetHeatingCoolingState)
			.on('get', this.getTargetHeatingCoolingState.bind(this))
			.on('set', this.setTargetHeatingCoolingState.bind(this));

		this.service
			.getCharacteristic(Characteristic.CurrentTemperature)
			.on('get', this.getCurrentTemperature.bind(this));

		this.service
			.getCharacteristic(Characteristic.TargetTemperature)
			.on('get', this.getTargetTemperature.bind(this))
			.on('set', this.setTargetTemperature.bind(this));

		this.service
			.getCharacteristic(Characteristic.TemperatureDisplayUnits)
			.on('get', this.getTemperatureDisplayUnits.bind(this))
			.on('set', this.setTemperatureDisplayUnits.bind(this));

		this.service
			.getCharacteristic(Characteristic.Name)
			.on('get', this.getName.bind(this));

		this.service.getCharacteristic(Characteristic.TargetTemperature)
			.setProps({
				minValue: 11,
				maxValue: 22,
				minStep: 1
			});

		this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
			.setProps({
				validValues: [1]
			});

		return [this.informationService, this.service];
	}
};
