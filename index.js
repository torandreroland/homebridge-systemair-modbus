var Service, Characteristic;
var request = require("request");
var Modbus = require("jsmodbus");
var net = require("net");

module.exports = function(homebridge){
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("homebridge-modbus-thermostat", "Modbus Thermostat", Thermostat);
};

function Thermostat(log, config) {
	this.log = log;

  this.name = config.name;
  this.manufacturer = config.manufacturer || 'Systemair';
  this.model = config.model || 'VTR300';
  this.serial = config.serial || 'SN1';

  this.apiroute = config.apiroute
  this.username = config.username || null;
	this.password = config.password || null;
  this.timeout = config.timeout || 5000;
  this.http_method = config.http_method || 'GET';

  this.temperatureDisplayUnits = config.temperatureDisplayUnits || 0;
	this.maxTemp = config.maxTemp || 11;
  this.minTemp = config.minTemp || 22;
  this.minStep = config.minStep || 1;
  this.targetTemperature = 20;
	this.currentTemperature = 20;
  this.targetHeatingCoolingState = 1;
	this.heatingCoolingState = 1;

  if(this.username != null && this.password != null){
    this.auth = {
      user : this.username,
      pass : this.password
    };
  }

  this.log(this.name, this.apiroute);

	this.service = new Service.Thermostat(this.name);
}

Thermostat.prototype = {

	identify: function(callback) {
		this.log("Identify requested!");
		callback();
	},

  _httpRequest: function (url, body, method, callback) {
      request({
          url: url,
          body: body,
          method: this.http_method,
          timeout: this.timeout,
          rejectUnauthorized: false,
          auth: this.auth
      },
          function (error, response, body) {
              callback(error, response, body);
          });
  },

	getCurrentHeatingCoolingState: function(callback) {
    this.log("[+] getCurrentHeatingCoolingState from:", this.apiroute+"/status");
    var url = this.apiroute+"/status";
    this._httpRequest(url, '', 'GET', function (error, response, responseBody) {
        if (error) {
          this.log("[!] Error getting currentHeatingCoolingState: %s", error.message);
  				callback(error);
        } else {
          var json = JSON.parse(responseBody);
          this.log("[*] currentHeatingCoolingState: %s", json.currentHeatingCoolingState);
          this.currentHeatingCoolingState = json.currentHeatingCoolingState;
          callback(null, this.currentHeatingCoolingState);
        }
    }.bind(this));
  },
  
  getTargetHeatingCoolingState: function(callback) {
    this.log("[+] getTargerHeatingCoolingState from:", this.apiroute+"/status");
    var url = this.apiroute+"/status";
    this._httpRequest(url, '', 'GET', function (error, response, responseBody) {
        if (error) {
          this.log("[!] Error getting targetHeatingCoolingState: %s", error.message);
  				callback(error);
        } else {
          var json = JSON.parse(responseBody);
          this.log("[*] targetHeatingCoolingState: %s", json.targetHeatingCoolingState);
          this.targetHeatingCoolingState = json.targetHeatingCoolingState;
          callback(null, this.targetHeatingCoolingState);
        }
    }.bind(this));
  },

  setTargetHeatingCoolingState: function(value, callback) {
    this.log("[+] setTargetHeatingCoolingState from %s to %s", this.targetHeatingCoolingState, value);
    url = this.apiroute + '/targetHeatingCoolingState/' + value;
    this._httpRequest(url, '', 'GET', function (error, response, responseBody) {
        if (error) {
          this.log("[!] Error setting targetHeatingCoolingState: %s", error.message);
					callback(error);
        } else {
          this.log("[*] Sucessfully set targetHeatingCoolingState to %s", value);
          this.service.setCharacteristic(Characteristic.CurrentHeatingCoolingState, value);
          callback();
        }
    }.bind(this));
  },

  getCurrentTemperature: function(callback) {
    this.log("[+] getCurrentTemperature from:", this.apiroute+"/status");
    var url = this.apiroute+"/status";
    this._httpRequest(url, '', 'GET', function (error, response, responseBody) {
        if (error) {
          this.log("[!] Error getting currentTemperature: %s", error.message);
  				callback(error);
        } else {
  				var json = JSON.parse(responseBody);
          this.currentTemperature = parseFloat(json.currentTemperature);
          this.log("[*] currentTemperature: %s", json.currentTemperature);
  				callback(null, this.currentTemperature);
        }
    }.bind(this));
  },

  getTargetTemperature: function(callback) {
    this.log("[+] getTargetTemperature from:", this.apiroute+"/status");
    var url = this.apiroute+"/status";
    this._httpRequest(url, '', 'GET', function (error, response, responseBody) {
        if (error) {
          this.log("[!] Error getting targetTemperature: %s", error.message);
  				callback(error);
        } else {
  				var json = JSON.parse(responseBody);
  				this.targetTemperature = parseFloat(json.targetTemperature);
  				this.log("[*] targetTemperature: %s", this.targetTemperature);
  				callback(null, this.targetTemperature);
        }
    }.bind(this));
  },

  setTargetTemperature: function(value, callback) {
    this.log("[+] setTargetTemperature from %s to %s", this.targetTemperature, value);
    var url = this.apiroute+"/targetTemperature/"+value;
    this._httpRequest(url, '', 'GET', function (error, response, responseBody) {
        if (error) {
          this.log("[!] Error setting targetTemperature", error.message);
  				callback(error);
        } else {
          this.log("[*] Sucessfully set targetTemperature to %s", value);
  				callback();
        }
    }.bind(this));
  },

	getTemperatureDisplayUnits: function(callback) {
		//this.log("getTemperatureDisplayUnits:", this.temperatureDisplayUnits);
		callback(null, this.temperatureDisplayUnits);
	},

  setTemperatureDisplayUnits: function(value, callback) {
		this.log("[*] setTemperatureDisplayUnits from %s to %s", this.temperatureDisplayUnits, value);
		this.temperatureDisplayUnits = value;
		callback();
	},

	getName: function(callback) {
		this.log("getName :", this.name);
		callback(null, this.name);
	},

	getServices: function() {

		this.informationService = new Service.AccessoryInformation();
    this.informationService
		  .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
		  .setCharacteristic(Characteristic.Model, this.model)
		  .setCharacteristic(Characteristic.SerialNumber, this.serial);

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

		this.service.getCharacteristic(Characteristic.CurrentTemperature)
			.setProps({
				minStep: this.minStep
			});

		this.service.getCharacteristic(Characteristic.TargetTemperature)
			.setProps({
				minValue: this.minTemp,
				maxValue: this.maxTemp,
				minStep: this.minStep
			});
		return [this.informationService, this.service];
	}
};
