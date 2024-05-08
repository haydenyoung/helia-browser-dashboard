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
import { createOrbitDB } from '@orbitdb/core'

const protocol = "/helia-browser-dashboard/1.0.0"

const connectedPeers = []
let helia
let orbitdb
let db

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
  const peerAddress = document.getElementById("peerAddressTextBox").value

  console.log('dialling stream...')
  const stream = await helia.libp2p.dialProtocol(multiaddr(peerAddress), protocol, { runOnTransientConnection })
  console.log('stream dialled')

  pipe(outgoing, stream)
}

document.getElementById("hangup").onclick = async function () {
  await stopStream()
}

async function stopStream() {
  /*
  console.log('Hanging up...')
  await helia.libp2p.hangUp(multiaddr(peerAddress))
  console.log('Hung up')
  */
  console.log('stopping...')
  await helia.libp2p.stop()
  console.log('stopped')
  console.log('restarting...')
  await helia.libp2p.start()
  console.log('restarted')
}

document.getElementById("startOrbitDB").onclick = async function () {
  await startOrbitDB()
}

async function startOrbitDB() {
  console.log('starting orbitdb...')
  orbitdb = await createOrbitDB({ ipfs: helia })
  console.log('orbitdb started')
}

document.getElementById("openDB").onclick = async function () {
  await openDB()
}

async function openDB() {
  const nameOrAddress = document.getElementById("dbTextBox").value
  console.log('opening db...', nameOrAddress)
  db = await orbitdb.open(nameOrAddress)
  db.events.on('join', (peerId, heads) => {
    console.log('joined', peerId)
  })
  db.events.on('update', async entry => {
    console.log('retrieving all records...')
    const all = await db.all()
    document.getElementById("dbRecords").innerHTML = ""
    document.getElementById("dbRecords").innerHTML += all.reverse().map(v => v.value).join('<br/>')
    console.log('all records retrieved')
  })
  document.getElementById("dbAddress").innerText = db.address
  console.log('db opened')
}

document.getElementById("saveRecord").onclick = async function () {
  await saveRecord()
}

async function saveRecord() {
  const record = document.getElementById("recordTextBox").value
  console.log('saving record...', record)
  const hash = await db.add(record)
  console.log('record saved', hash)
}
