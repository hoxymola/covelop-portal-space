import { configuration } from './signalling.js';
import { copyToClipboard } from './utils.js';


mdc.ripple.MDCRipple.attachTo(document.querySelector('.mdc-button'));


let peerConnection = null;
let localStream = null;
let remoteStream = null;
let roomDialog = null;
let roomId = null;

const originMyVideo = document.getElementById('localVideo');
const videoElement = document.getElementById('myConvertVideo');
const canvas = document.getElementById('myCanvas');
const ctx = canvas.getContext('2d');
const originMyVideo2 = document.getElementById('remoteVideo');
const videoElement2 = document.getElementById('myConvertVideo2');
const canvas2 = document.getElementById('myCanvas2');
const ctx2 = canvas2.getContext('2d');
let imgElement = document.getElementById('imageSrc');
let inputElement = document.getElementById('fileInput');
inputElement.addEventListener('change', (e) => {
  imgElement.src = URL.createObjectURL(e.target.files[0]);
}, false);




function init() {
  document.querySelector('#cameraBtn').addEventListener('click', openUserMedia);
  document.querySelector('#hangupBtn').addEventListener('click', hangUp);
  document.querySelector('#createBtn').addEventListener('click', createRoom);
  document.querySelector('#joinBtn').addEventListener('click', joinRoom);
  roomDialog = new mdc.dialog.MDCDialog(document.querySelector('#room-dialog'));
}

async function createRoom() {
  //document.querySelector('#createBtn').disabled = true;
  //document.querySelector('#joinBtn').disabled = true;
  const db = firebase.firestore();
  const roomRef = await db.collection('rooms').doc();

  console.log('Create PeerConnection with configuration: ', configuration);
  peerConnection = new RTCPeerConnection(configuration);

  registerPeerConnectionListeners();

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Code for collecting ICE candidates below
  const callerCandidatesCollection = roomRef.collection('callerCandidates');

  peerConnection.addEventListener('icecandidate', event => {
    if (!event.candidate) {
      console.log('Got final candidate!');
      return;
    }
    console.log('Got candidate: ', event.candidate);
    callerCandidatesCollection.add(event.candidate.toJSON());
  });
  // Code for collecting ICE candidates above

  // Code for creating a room below
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  console.log('Created offer:', offer);

  const roomWithOffer = {
    'offer': {
      type: offer.type,
      sdp: offer.sdp,
    },
  };
  await roomRef.set(roomWithOffer);
  roomId = roomRef.id;
  console.log(`New room created with SDP offer. Room ID: ${roomRef.id}`);
  copyToClipboard(roomRef.id)
  document.querySelector(
    '#currentRoom').innerText = `Current room is ${roomRef.id} - Send this to your friend!`;
  // Code for creating a room above

  peerConnection.addEventListener('track', event => {
    console.log('Got remote track:', event.streams[0]);
    event.streams[0].getTracks().forEach(track => {
      console.log('Add a track to the remoteStream:', track);
      remoteStream.addTrack(track);
    });
  });

  // Listening for remote session description below
  roomRef.onSnapshot(async snapshot => {
    const data = snapshot.data();
    if (!peerConnection.currentRemoteDescription && data && data.answer) {
      console.log('Got remote description: ', data.answer);
      const rtcSessionDescription = new RTCSessionDescription(data.answer);
      await peerConnection.setRemoteDescription(rtcSessionDescription);
    }
  });
  // Listening for remote session description above

  // Listen for remote ICE candidates below
  roomRef.collection('calleeCandidates').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async change => {
      if (change.type === 'added') {
        let data = change.doc.data();
        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
        await peerConnection.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
  // Listen for remote ICE candidates above
}

function joinRoom() {
  // document.querySelector('#createBtn').disabled = true;
  // document.querySelector('#joinBtn').disabled = true;

  document.querySelector('#confirmJoinBtn').
    addEventListener('click', async () => {
      roomId = document.querySelector('#room-id').value;
      console.log('Join room: ', roomId);
      // document.querySelector(
      //     '#currentRoom').innerText = `Current room is ${roomId} - You are the callee!`;
      await joinRoomById(roomId);
    }, { once: true });
  roomDialog.open();
}

async function joinRoomById(roomId) {
  const db = firebase.firestore();
  const roomRef = db.collection('rooms').doc(`${roomId}`);
  const roomSnapshot = await roomRef.get();
  console.log('Got room:', roomSnapshot.exists);

  if (roomSnapshot.exists) {
    console.log('Create PeerConnection with configuration: ', configuration);
    peerConnection = new RTCPeerConnection(configuration);
    registerPeerConnectionListeners();
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // Code for collecting ICE candidates below
    const calleeCandidatesCollection = roomRef.collection('calleeCandidates');
    peerConnection.addEventListener('icecandidate', event => {
      if (!event.candidate) {
        console.log('Got final candidate!');
        return;
      }
      console.log('Got candidate: ', event.candidate);
      calleeCandidatesCollection.add(event.candidate.toJSON());
    });
    // Code for collecting ICE candidates above

    peerConnection.addEventListener('track', event => {
      console.log('Got remote track:', event.streams[0]);
      event.streams[0].getTracks().forEach(track => {
        console.log('Add a track to the remoteStream:', track);
        remoteStream.addTrack(track);
      });
    });
    
    //덕규추가
    
    ///여기까지

    // Code for creating SDP answer below
    const offer = roomSnapshot.data().offer;
    console.log('Got offer:', offer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    console.log('Created answer:', answer);
    await peerConnection.setLocalDescription(answer);

    const roomWithAnswer = {
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      },
    };
    await roomRef.update(roomWithAnswer);
    // Code for creating SDP answer above

    // Listening for remote ICE candidates below
    roomRef.collection('callerCandidates').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'added') {
          let data = change.doc.data();
          console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
          await peerConnection.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
    // Listening for remote ICE candidates above
  }
}

async function openUserMedia(e) {
  const stream = await navigator.mediaDevices.getUserMedia(
    { video: true, audio: true });
  document.querySelector('#localVideo').srcObject = stream;
  localStream = stream;
  videoElement.srcObject = stream;
  videoElement.play();
  
  remoteStream = new MediaStream();

  document.querySelector('#remoteVideo').srcObject = remoteStream;
  videoElement2.srcObject = remoteStream;
  videoElement2.play();
  console.log('Stream:', document.querySelector('#localVideo').srcObject);
  document.querySelector('#cameraBtn').disabled = true;
  document.querySelector('#joinBtn').disabled = false;
  document.querySelector('#createBtn').disabled = false;
  document.querySelector('#hangupBtn').disabled = false;
}

const croma = document.getElementById('chromakey');
croma.addEventListener('click', e => {
  originMyVideo.hidden = true;
  canvas.hidden = false;
  loadBodyPix();

});

const croma2 = document.getElementById('chromakey2');
croma2.addEventListener('click', e => {
  originMyVideo2.hidden = true;
  canvas2.hidden = false;
  loadBodyPix2();

});
async function loadBodyPix() {
  canvas.height = videoElement.videoheight;
  canvas.width = videoElement.videowidth;
  const options = {
    multiplier: 0.75,
    stride: 32,
    quantBytes: 4
  }
  const net = await bodyPix.load(options);
  let back = cv.imread(imgElement);
  while (1) {
    const segmentation = await net.segmentPerson(myConvertVideo);
    const foregroundColor = { r: 0, g : 0, b : 0, a:0};
    const backgroundColor = { r: 0, g : 0, b : 0, a:255};
    const backgroundDarkeningMask = bodyPix.toMask(
      segmentation,foregroundColor,backgroundColor);
    const opacity = 1.0;
    const maskBlurAmount = 3;
    const backgroundBlurAmount = 6;
    const edgeBlurAmount = 2;
    const flipHorizontal = false;
    let cap = new cv.VideoCapture('myConvertVideo');
    let src = new cv.Mat(videoElement.height, videoElement.width,cv.CV_8UC4);
    let dst = new cv.Mat(videoElement.height, videoElement.width,cv.CV_8UC4);
    cap.read(src);
    src.copyTo(dst);
    let mask = cv.matFromArray(src.rows,src.cols,cv.CV_8UC4,backgroundDarkeningMask.data);
    
    for(let i=0;i<src.rows;i++){
      for(let j=0;j<src.cols;j++){
        if(mask.ucharPtr(i,j)[3]==255){
          dst.ucharPtr(i,j)[0]=back.ucharPtr(i,j)[0];
          dst.ucharPtr(i,j)[1]=back.ucharPtr(i,j)[1];
          dst.ucharPtr(i,j)[2]=back.ucharPtr(i,j)[2];
          dst.ucharPtr(i,j)[3]=back.ucharPtr(i,j)[3];
        }
      }
    }

    cv.imshow("myCanvas",dst);
    /*bodyPix.drawMask(
      myCanvas, myConvertVideo, backgroundDarkeningMask, opacity, maskBlurAmount,
      flipHorizontal
    );*/
  }
}


async function loadBodyPix2() {
  canvas2.height = videoElement2.videoheight;
  canvas2.width = videoElement2.videowidth;
  const options = {
    multiplier: 0.75,
    stride: 32,
    quantBytes: 4
  }
  const net = await bodyPix.load(options);
  let back = cv.imread(imgElement);
  
  while (1) {
    const segmentation = await net.segmentPerson(myConvertVideo2);
    const foregroundColor = { r: 0, g : 0, b : 0, a:0};
    const backgroundColor = { r: 0, g : 0, b : 0, a:255};
    const backgroundDarkeningMask = bodyPix.toMask(
      segmentation,foregroundColor,backgroundColor);
    const opacity = 1.0;
    const maskBlurAmount = 3;
    const backgroundBlurAmount = 6;
    const edgeBlurAmount = 2;
    const flipHorizontal = false;

    let cap = new cv.VideoCapture('myConvertVideo2');
    let src = new cv.Mat(videoElement.height, videoElement.width,cv.CV_8UC4);
    let dst = new cv.Mat(videoElement.height, videoElement.width,cv.CV_8UC4);
    cap.read(src);
    src.copyTo(dst);
    let mask = cv.matFromArray(src.rows,src.cols,cv.CV_8UC4,backgroundDarkeningMask.data);
    cv.resize(back,back,new cv.Size(src.rows,src.cols),0,0,cv.INTER_LINEAR);
    for(let i=0;i<src.rows;i++){
      for(let j=0;j<src.cols;j++){
        if(mask.ucharPtr(i,j)[3]==255){
          dst.ucharPtr(i,j)[0]=back.ucharPtr(i,j)[0];
          dst.ucharPtr(i,j)[1]=back.ucharPtr(i,j)[1];
          dst.ucharPtr(i,j)[2]=back.ucharPtr(i,j)[2];
          dst.ucharPtr(i,j)[3]=back.ucharPtr(i,j)[3];
        }
      }
    }

    cv.imshow("myCanvas2",dst);
    /*bodyPix.drawMask(
      myCanvas2, myConvertVideo2, backgroundDarkeningMask, opacity, maskBlurAmount,
      flipHorizontal
    );*/
  }
}


async function hangUp(e) {
  const tracks = document.querySelector('#localVideo').srcObject.getTracks();
  tracks.forEach(track => {
    track.stop();
  });

  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }

  document.querySelector('#localVideo').srcObject = null;
  document.querySelector('#remoteVideo').srcObject = null;
  document.querySelector('#cameraBtn').disabled = false;
  document.querySelector('#joinBtn').disabled = true;
  document.querySelector('#createBtn').disabled = true;
  document.querySelector('#hangupBtn').disabled = true;
  document.querySelector('#currentRoom').innerText = '';

  // Delete room on hangup
  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(roomId);
    const calleeCandidates = await roomRef.collection('calleeCandidates').get();
    calleeCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    const callerCandidates = await roomRef.collection('callerCandidates').get();
    callerCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    await roomRef.delete();
  }

  document.location.reload(true);
}

function registerPeerConnectionListeners() {
  peerConnection.addEventListener('icegatheringstatechange', () => {
    console.log(
      `ICE gathering state changed: ${peerConnection.iceGatheringState}`);
  });

  peerConnection.addEventListener('connectionstatechange', () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);
  });

  peerConnection.addEventListener('signalingstatechange', () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
  });

  peerConnection.addEventListener('iceconnectionstatechange ', () => {
    console.log(
      `ICE connection state change: ${peerConnection.iceConnectionState}`);
  });
}

init();
