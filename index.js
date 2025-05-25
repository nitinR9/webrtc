const inputFile = document.getElementById('file')
const text = document.getElementById('text')
const offerbtn = document.getElementById('getoffer')
const ansbtn = document.getElementById('getans')
const setansbtn = document.getElementById('setans')
const progress = document.getElementById('progress')
const ptext = document.getElementById('ptext')
const sendbtn = document.getElementById('send')

const worker = new Worker('worker.js')

let localConnection, remoteConnection, dataChannel ;
let file, offset = 0, backpressureHits = 0, startTime = 0
const CHUNK_SIZE = 256 * 1024 ;
const THRESHOLD = 65536

const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.l.google.com:5349" },
    { urls: "stun:stun1.l.google.com:3478" },
    { urls: "stun:stun1.l.google.com:5349" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:5349" },
    { urls: "stun:stun3.l.google.com:3478" },
    { urls: "stun:stun3.l.google.com:5349" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:5349" }
];

window.addEventListener('beforeunload', () => {
    if (dataChannel && dataChannel.readyState === 'open'){
        dataChannel.close()
    }
    if (localConnection){
        localConnection.close()
    }
    if (remoteConnection){
        remoteConnection.close()
    }
})

worker.onmessage = (e) => {
    const { type, data } = e.data
    
    switch(type){
        case 'progress': {
            progress.value = data
            ptext.textContent = data.toFixed(2)
            break
        }
        case 'done': {
            console.log(data.message)
            if (data.blob && data.filename){
                const a = document.createElement("a");
                a.href = URL.createObjectURL(data.blob);
                a.download = data.filename;
                a.click();
            }
            file = null
            break;
        }
    }
}

sendbtn.onclick = () => {
    progress.value = 0
    file = inputFile.files[0]
    if (!file || !dataChannel || dataChannel.readyState !== "open") {
        console.error('File or data channel not ready')
        return ;
    }
    
    const metadata = JSON.stringify({ name: file.name, size: file.size });
    dataChannel.send(`META:${metadata}`);
    
    offset = 0
    startTime = performance.now()
    sendNextChunk()
}

offerbtn.onclick = async () => {
    console.log('clicked get offer')
    text.value = ''
    localConnection = new RTCPeerConnection({ iceServers })
    dataChannel = localConnection.createDataChannel('file')
    dataChannel.binaryType = 'arraybuffer'
    dataChannel.bufferedAmountLowThreshold = THRESHOLD
    dataChannel.onbufferedamountlow = () => {
        worker.postMessage({ type: 'resume' })
    }
    
    dataChannel.onopen = () => {
        console.info('SENDER: Data Channel opened')
        sendbtn.disabled = false
    }
    dataChannel.onclose = () => {
        console.info('SENDER: Data Channel closed')
        sendbtn.disabled = true
    }
    const offer = localConnection.createOffer()
    await localConnection.setLocalDescription(offer)
    await waitForIceGathering(localConnection)
    text.value = JSON.stringify(localConnection.localDescription)
}

ansbtn.onclick = async () => {
    console.log('clicked get ans')
    remoteConnection = new RTCPeerConnection({ iceServers })
    remoteConnection.ondatachannel = e => {
        const receiveChannel = e.channel
        
        receiveChannel.onmessage = e => {
            console.log('receiver on message', e.data)
            worker.postMessage({
                type: 'receive',
                data: e.data
            })
        }
        receiveChannel.onerror = (e) => console.error('RECEIVE:', e)
    }
    const offer = JSON.parse(text.value)
    await remoteConnection.setRemoteDescription(offer)
    const answer = await remoteConnection.createAnswer()
    await remoteConnection.setLocalDescription(answer)
    await waitForIceGathering(remoteConnection)
    text.value = JSON.stringify(remoteConnection.localDescription)
}

setansbtn.onclick = async () => {
    console.log('clicked set ans')
    const ans = JSON.parse(text.value)
    await localConnection.setRemoteDescription(ans)
}

function waitForIceGathering(pc) {
    return new Promise(resolve => {
        if (pc.iceGatheringState === "complete") return resolve();
        pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === "complete") resolve();
        };
    });
}

function sendNextChunk(){
    if (offset >= file.size){
        console.log('all chunks sent')
        console.log('backpressure hits', backpressureHits)
        const timeTaken = (performance.now() - startTime)/1000
        console.log('total time in sec:', timeTaken.toFixed(2))
        return
    }

    const slice = file.slice(offset, offset + CHUNK_SIZE)
    const reader = new FileReader()

    reader.onload = () => {
        const chunk = reader.result

        if (dataChannel.bufferedAmount > THRESHOLD){
            dataChannel.onbufferedamountlow = () => {
                backpressureHits++
                dataChannel.send(chunk)
                offset += chunk.byteLength
                updateProgress((offset / file.size) * 100)
                dataChannel.onbufferedamountlow = null
                sendNextChunk()
            }
        }
        else{
            dataChannel.send(chunk)
            offset += chunk.byteLength
            updateProgress((offset / file.size) * 100)
            sendNextChunk()
        }
    }

    reader.readAsArrayBuffer(slice)
}

function updateProgress(p){
    progress.value = p
    ptext.textContent = p.toFixed(2)
}