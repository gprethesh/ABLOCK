const createDb = require("./chain.js").createDb;
const getWalletBalance = require("./chain.js").getWalletBalance;

const bal = async () => {
  await createDb("hello");
  const bal1 = await getWalletBalance(
    "04227ea4320cfd7d50fd821b3cc66d7bcbd80a8806dc3e5ce90fba3c6594920c482d6360933fd149363d5d1177320e108d836165ae48ece6d9c54919565c2f0562"
  );
  const bal2 = await getWalletBalance(
    "044c5d25bd9c6b2798c0171013107cf114906fc941e6a055fcdce2abf5ea88ff73453c70f34c27e5bd92f7e96a6af22a87cba865d0e29bbf914a0ff9ff44b86883"
  );

  const bal3 = await getWalletBalance(
    "04a8bc99fdb9c5f8a2c1b1a6660ea96ba233317901a9927544c23de6a1926f3c8ffdb37e9ca7b3c8858289209cdea8fb6ff1b15daf7d508b0c859e0e9fea11f508"
  );

  const Miner = await getWalletBalance(
    "04c590a6b268f13a042e1b0f9c52f291db78f042659ad257a39fead537452b6657d161b988cd5b90b29c16192ecc139ff48b181c7b99555514d6ec375308c19bbd"
  );

  console.log(`GENESIS WALLET:`, bal1);
  console.log(`USER:`, bal2);
  console.log(`2ND USER:`, bal3);
  console.log(`Miner:`, Miner);
};

bal();
