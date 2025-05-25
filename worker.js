let CHUNK_SIZE = 0, CHUNK_THRESHOLD = 0, offset = 0, expectedFileSize = 0, receivedFileName = 'downloaded_file', receiveBuffer = [], receivedSize = 0, intermediateBlobs = [];
const INTERMEDIATE_BLOB_LIMIT = 500 * 1024 * 1024 ;


self.onmessage = async (e) => {
    const { type, data } = e.data
    
    switch(type){
        case 'send': {
            console.log('worker sending file')
            offset = 0
            const file = data.file
            CHUNK_SIZE = data.CHUNK_SIZE
            
            console.log('file', file)
            const reader = new FileReader()
            const readChunk = (blob) => {
                return new Promise((res, rej) => {
                    reader.onload = () => res(reader.result)
                    reader.onerror = rej
                    reader.readAsArrayBuffer(blob)
                })
            }

            while(paused){
                await new Promise(r => setTimeout(r, 16))
            }
            
            while(offset < file.size){
                const chunkBlob = file.slice(offset, offset + CHUNK_SIZE)
                const chunk = await readChunk(chunkBlob)
                postMessage({ type: 'chunk', data: chunk }, [chunk])

                offset += chunk.byteLength
                console.log('offset', offset, '/', file.size)
                postMessage({ type: 'progress', data: (offset/file.size) * 100 })

                paused = true
            }

            
            postMessage({
                type: 'done',
                data: {
                    message: 'Completed sending the file'
                }
            })
            break
        }
        case 'receive': {
            const chunk = data
            if (typeof chunk === 'string' && chunk.startsWith('META:')){
                console.log('receive meta')
                const metadata = JSON.parse(chunk.slice(5))
                expectedFileSize = metadata.size
                receivedFileName = metadata.name
                receiveBuffer = []
                intermediateBlobs = []
                receivedSize = 0
                
                console.log(`Worker got file metadata: ${receivedFileName} (${(expectedFileSize/Math.pow(1024,2)).toFixed(2)})MB`, expectedFileSize)
            }
            else{
                receiveBuffer.push(chunk)
                receivedSize += chunk.byteLength

                if (receiveBuffer.reduce((prev, curr) => prev + curr.byteLength, 0) >= INTERMEDIATE_BLOB_LIMIT){
                    const blobPart = new Blob(receiveBuffer)
                    intermediateBlobs.push(blobPart)
                    receiveBuffer = []
                }

                postMessage({
                    type: 'progress',
                    data: (receivedSize/expectedFileSize) * 100
                })
                
                if (receivedSize >= expectedFileSize){
                    if (receiveBuffer.length > 0){
                        intermediateBlobs.push(new Blob(receiveBuffer))
                    }

                    const finalBlob = new Blob(intermediateBlobs)
                    postMessage({
                        type: 'done',
                        data: {
                            blob: finalBlob,
                            filename: receivedFileName,
                            message: `completed receiving file: ${receivedFileName}`
                        }
                    })

                    receiveBuffer = []
                    intermediateBlobs = []
                }
            }
            break
        }
    }
}

