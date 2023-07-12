const path = require("path");
const EC = require("elliptic").ec;
const fs = require("fs");
const ec = new EC("secp256k1");

let balances = {};

const keysDir = path.join(__dirname, "wallet");
const keysFile = path.join(keysDir, "keys.json");

exports.initWallet = () => {
  let keys;

  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir);
  }

  if (fs.existsSync(keysFile)) {
    const data = fs.readFileSync(keysFile, "utf8");
    keys = JSON.parse(data);
  } else {
    const privateKey = generatePrivateKey();
    const key = ec.keyFromPrivate(privateKey, "hex");
    const publicKey = key.getPublic().encode("hex");

    keys = {
      privateKey: privateKey,
      publicKey: publicKey,
    };

    fs.writeFileSync(keysFile, JSON.stringify(keys));
  }

  return keys;
};

const generatePrivateKey = () => {
  const keyPair = ec.genKeyPair();
  const privateKey = keyPair.getPrivate();
  return privateKey.toString(16);
};

// Initialize wallet
let wallet = this;
let keys = wallet.initWallet();

console.log(JSON.stringify(keys));

module.exports.balances = balances;
