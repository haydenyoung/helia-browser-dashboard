// Import our custom CSS
import "../scss/styles.scss";

// Import all of Bootstrap's JS
import * as bootstrap from "bootstrap";

import { initHelia } from "./helia.js";
import { multiaddr } from "@multiformats/multiaddr";
import { WebRTC } from "@multiformats/multiaddr-matcher";
import pRetry from "p-retry";
import delay from "delay";
import { pipe } from "it-pipe"
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { toString as uint8ArrayToString } from 'uint8arrays/to-string'

const protocol = "/helia-browser-dashboard/1.0.0"

let helia;
const connectedPeers = [];

document.getElementById("start").onclick = async function () {
  console.log("starting helia...");
  helia = await initHelia();
  console.log("helia started", helia.libp2p.peerId.toString());

  console.log("registering event handlers...");
  helia.libp2p.addEventListener("peer:connect", (event) => {
    addConnectedPeer(event.detail.toString());
  });

  helia.libp2p.addEventListener("peer:disconnect", (event) => {
    removeConnectedPeer(event.detail.toString());
  });
  console.log("event handlers registered");

  document.getElementById("peerId").innerHTML = helia.libp2p.peerId.toString();
  document.getElementById("mask").className = "visible";
};

document.getElementById("discover").onclick = async function () {
  const relayAddress = document.getElementById("relayAddressTextBox").value;
  console.log("discovering...");

  console.log("dialling relay...");
  await helia.libp2p.dial(multiaddr(relayAddress));
  console.log("relay dialled");

  console.log("finding address...");

  let address;

  try {
    address = await pRetry(async () => {
      console.log(helia.libp2p.getMultiaddrs());
      const addr = helia.libp2p
        .getMultiaddrs()
        .filter((ma) => WebRTC.matches(ma))
        .pop();

      if (addr == null) {
        await delay(10);
        throw new Error("No WebRTC address found");
      }

      return addr;
    });

    console.log("address found", address);
  } catch (err) {
    console.log(err.message);
    address = "No address found";
  }

  document.getElementById("peerAddress").innerHTML = address;
};

document.getElementById("connect").onclick = async function () {
  const peerAddress = document.getElementById("peerAddressTextBox").value;
  console.log("connecting directly to peer...", peerAddress);

  const conn = await helia.libp2p.dial(multiaddr(peerAddress));

  console.log("connected directly to remote peer", conn.remoteAddr);
};

function addConnectedPeer(item) {
  var index = connectedPeers.indexOf(item);
  if (index === -1) {
    connectedPeers.push(item);
    updateConnectedPeers();
  }
}

function removeConnectedPeer(item) {
  var index = connectedPeers.indexOf(item);
  if (index !== -1) {
    connectedPeers.splice(index, 1);
    updateConnectedPeers();
  }
}

function updateConnectedPeers() {
  var ul = document.getElementById("connectedPeers");

  ul.innerHTML = "";

  for (var i = 0; i < connectedPeers.length; i++) {
    var li = document.createElement("li");
    li.appendChild(document.createTextNode(connectedPeers[i]));
    ul.appendChild(li);
  }
}

document.getElementById("registerStream").onclick = async function () {
  await registerStream()
}

const result = async (source) => {
    for await (const val of source) {
        console.log("val", uint8ArrayToString(val.subarray()))
    }
};  

const incoming = ({ protocol, stream }) => {
    pipe(stream, result)
}

async function registerStream() {
  console.log('registering stream...')

  await helia.libp2p.handle(protocol, incoming)
  console.log('stream registered')
}

document.getElementById("stream").onclick = async function () {
  await startStream()
}

const outgoing = (source) => {
    return (async function* () {
        for (let i = 0; i < 10; i++) {
    		yield uint8ArrayFromString(`Iteration ${i}`);
    		await new Promise(resolve => setTimeout(resolve, 5000));
    	}
    })();
};

async function startStream() {
  const runOnTransientConnection = true
  
  console.log('starting stream...')
  const peerAddress = document.getElementById("peerAddressTextBox").value;

  console.log('dialling stream...')
  const stream = await helia.libp2p.dialProtocol(multiaddr(peerAddress), protocol, { runOnTransientConnection });
  console.log('stream dialled')

  pipe(outgoing, stream);
}
