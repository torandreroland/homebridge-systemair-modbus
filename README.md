# homebridge-systemair-modbus
This is a plugin for [Homebridge](https://github.com/nfarina/homebridge). It
implements a Systemair Villavent VTR300 unit connected via Modbus TCP as a HomeKit accessory and exposes the following services:

- Thermostat
- Fan
- Filter Maintenance

## Installation

1. Install [homebridge](https://github.com/nfarina/homebridge#installation-details)
2. Install this plugin: `npm install -g homebridge-systemair-modbus`
3. Update your `config.json` file (See below).

## Configuration example

```json
"accessories": [
  {
    "accessory": "systemairModbus",
    "name": "Systemair Ventilation",
    "host": "10.0.0.153",
    "port": 8234,
    "slave": 10
  }
]
```