const crypto = require("crypto");
const util = require("util");
const scryptAsync = util.promisify(crypto.scrypt);

async function calculateHashForBlock(block) {
  const data = [
    block.blockHeader.version,
    block.blockHeader.previousBlockHeader,
    block.blockHeader.merkleRoot,
    block.blockHeader.time,
    block.nonce.toString(),
  ].join("");

  const salt = "someConstantSalt"; // Generate a random salt
  const keylen = 32; // Length of the output key

  // Adjust these for CPU-friendly mining
  const N = 1024; // Lower CPU/memory cost factor
  const r = 4; // Lower block size
  const p = 1; // Lower parallelization factor

  try {
    const derivedKey = await scryptAsync(data, salt, keylen, { N, r, p });
    return derivedKey.toString("hex");
  } catch (err) {
    throw err; // Handle the error as you see fit
  }
}

const object = {
  blockHeader: {
    version: "1.0.0",
    previousBlockHeader:
      "7af5c7cc90143c05f24f32d5dac0684a89177a686200a9871e1405fb9451e1ab",
    merkleRoot:
      "efb1e41da0922dc8a3163622be0786a42ba7fb765def75b3b604639b9bef5e29",
    time: 1693296300007,
    difficulty: "0x10",
    hash: "0000aefc9ee641c5ce15813b3cbd53b2bdf579b2bd2435fe914d4a4ea3218ec0",
  },
  index: 1,
  transactions: [
    {
      sender: "coinbase",
      receiver:
        "04c590a6b268f13a042e1b0f9c52f291db78f042659ad257a39fead537452b6657d161b988cd5b90b29c16192ecc139ff48b181c7b99555514d6ec375308c19bbd",
      amount: 40,
      signature: undefined,
      fee: 0,
      time: 1693296300015,
      id: "48fbaf2ee4d231db4b974ae6e93f8a5bf7985c44f036934d5923585f443af76b",
    },
  ],
  tx: [],
  nonce: 12728,
  target:
    1766847064752673320875153656334247122350025295235263710221081515927797760n,
};

async function call() {
  const value = await calculateHashForBlock(object);
  console.log(`value`, value);
}

call();
