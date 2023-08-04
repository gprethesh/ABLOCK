const EventEmitter = require("events");

class MiningState extends EventEmitter {
  constructor() {
    super();
    this._isMining = false;

    // Singleton instance
    if (!MiningState.instance) {
      MiningState.instance = this;
    }

    return MiningState.instance;
  }

  get isMining() {
    return this._isMining;
  }

  set isMining(value) {
    this._isMining = value;
    this.emit("change", this._isMining);
  }
}

const instance = new MiningState();
// Object.freeze(instance);

module.exports = instance;
