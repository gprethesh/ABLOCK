const Hyperswarm = require("hyperswarm");

const swarm1 = new Hyperswarm();

const run = async () => {
  console.log(`running`);
  swarm1.on("connection", (conn, info) => {
    console.log(`inside`);
    let num = 0;
    // swarm1 will receive server connections
    setInterval(() => {
      conn.write(`this is a server connection ${num}`);
      console.log(`message sent`, num);
      num++;
    }, 2000);
  });

  const callFun = async () => {
    const topic = Buffer.alloc(32).fill("UPOW"); // A topic must be 32 bytes
    console.log("Joining topic:", topic.toString());
    const discovery = swarm1.join(topic, { server: true, client: false });
    await discovery.flushed(); // Waits for the topic to be fully announced on the DHT
    console.log("Topic announced on DHT");
    await swarm1.flush();
    console.log(`done`);
  };

  callFun();
};

run();
