const crypto = require("crypto");
const Swarm = require("discovery-swarm");
const defaults = require("dat-swarm-defaults");
const getPort = require("get-port");

const id = crypto.randomBytes(32);
console.log("Your identity: " + id.toString("hex"));

let config = defaults({
  id: id,
});

let swarm = new Swarm(config);

const peers = {};
let connSeq = 0;

const run = async () => {
  const port = await getPort();

  swarm.listen(port);
  console.log("Listening port: " + port);

  swarm.join("BOOST");
  swarm.on("connection", (conn, info) => {
    const seq = connSeq;
    const peerId = info.id.toString("hex");
    console.log(`Connected #${seq} to peer: ${peerId}`);

    if (info.initiator) {
      try {
        conn.setKeepAlive(true, 600);
      } catch (error) {
        console.log("error", error);
      }
    }

    conn.on("data", (data) => {
      console.log("Received message from peer:", data.toString());
    });

    conn.write("Hello, peer!");

    conn.on("close", () => {
      console.log(`Connection ${seq} closed, peerId: ${peerId}`);
      if (peers[peerId].seq === seq) {
        delete peers[peerId];
      }
    });

    if (!peers[peerId]) {
      peers[peerId] = {};
    }
    peers[peerId].conn = conn;
    peers[peerId].seq = seq;
    connSeq++;
  });
};

run();
