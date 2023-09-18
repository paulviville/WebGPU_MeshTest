import {CMap2} from './CMapJS/CMap/CMap.js';
import { loadCMap2 } from './CMapJS/IO/SurfaceFormats/CMap2IO.js';



/// create cmap from file
const offText = await fetch('./Files/cube.off').then(response => response.text());
const cmap = loadCMap2('off', offText);
cmap.setEmbeddings(cmap.vertex);
cmap.setEmbeddings(cmap.edge);
cmap.setEmbeddings(cmap.face);
cmap.setEmbeddings(cmap.volume);

const cmapPos = cmap.getAttribute(cmap.vertex, "position");

console.log(offText)
console.log(cmap)


/// initialize webgpu context

const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();

if(!device) {
	throw Error("webGPU intialization failed", adapter, device);
}



/// buffer containing nb Darts, vertex2, edge2, face2, volumes, etc...
const cellInfoArray = new Uint32Array([
	cmap.nbDarts(), cmap.nbCells(cmap.vertex), 
	cmap.nbCells(cmap.edge), cmap.nbCells(cmap.face), 
	cmap.nbCells(cmap.volume),
]);
console.log(cellInfoArray);

const cellInfoBuffer = device.createBuffer({
	label: "cell info storage buffer",
	size: cellInfoArray.byteLength,
	usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
});

device.queue.writeBuffer(cellInfoBuffer, 0, cellInfoArray);

/// DEBUG Staging buffer
// const cellInfoStagingBuffer = device.createBuffer({
// 	label: "cell info staging buffer",
// 	size: cellInfoArray.byteLength,
// 	usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
// });



/// dart topology buffer, vec4u (phi_1, phi1, phi2(, phi3))
const dartPhiArray = new Uint32Array(cmap.nbDarts() * 4);
cmap.foreachDart(d => {
	dartPhiArray[4*d] = cmap.phi_1[[d]];
	dartPhiArray[4*d+1] = cmap.phi1[d];
	dartPhiArray[4*d+2] = cmap.phi2[d];
	// dartPhiArray[4*d+3] = cmap.phi3(d);
})
console.log(dartPhiArray);

/// dart cell embeddings, vec4u(vertex2, edge2, face2, volume) 
const dartEmbedArray = new Uint32Array(cmap.nbDarts() * 4);
cmap.foreachDart(d => {
	dartEmbedArray[4*d] = cmap.cell(cmap.vertex, d);
	dartEmbedArray[4*d+1] = cmap.cell(cmap.edge, d);
	dartEmbedArray[4*d+2] = cmap.cell(cmap.face, d);
	dartEmbedArray[4*d+3] = cmap.cell(cmap.volume, d);
})
console.log(dartEmbedArray);

const MAXDARTS = 100000;
const DART_BUFFERS_SIZE = MAXDARTS * 4 * Uint32Array.BYTES_PER_ELEMENT;
const dartPhiBuffer = device.createBuffer({
	label: "dart phi storage buffer",
	size: DART_BUFFERS_SIZE,
	usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(dartPhiBuffer, 0, dartPhiArray);

const dartEmbedBuffer = device.createBuffer({
	label: "dart embed storage buffer",
	size: DART_BUFFERS_SIZE,
	usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(dartEmbedBuffer, 0, dartEmbedArray);

const MAXVERTICES = parseInt(MAXDARTS / 3);
const positionBuffer = device.createBuffer({
	label: "position/vertex buffer",
	size: MAXVERTICES,
	usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC,
});

/// DEBUG
const dartPhiStagingBuffer = device.createBuffer({
	label: "dart phi staging buffer",
	size: DART_BUFFERS_SIZE,
	usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
});
const dartEmbedStagingBuffer = device.createBuffer({
	label: "dart embed staging buffer",
	size: DART_BUFFERS_SIZE,
	usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
});




const commandEncoder = device.createCommandEncoder();
const passEncoder = commandEncoder.beginComputePass();
passEncoder.end();

commandEncoder.copyBufferToBuffer(
    dartPhiBuffer,
    0,
    dartPhiStagingBuffer,
    0,
    DART_BUFFERS_SIZE,   
);

commandEncoder.copyBufferToBuffer(
    dartEmbedBuffer,
    0,
    dartEmbedStagingBuffer,
    0,
    DART_BUFFERS_SIZE,   
);

const commands = commandEncoder.finish();
device.queue.submit([commands]);

await dartPhiStagingBuffer.mapAsync(
	GPUMapMode.READ,
	0,
	24*4,
	// DART_BUFFERS_SIZE,
);

const copyDartPhiArray = dartPhiStagingBuffer.getMappedRange(0, 24*4 /*DART_BUFFERS_SIZE */);
const dartPhiData = [...(new Uint32Array(copyDartPhiArray.slice()))];
console.table(dartPhiData);

await dartEmbedStagingBuffer.mapAsync(
	GPUMapMode.READ,
	0,
	24*4,
	// DART_BUFFERS_SIZE,
);

const copyDartEmbedArray = dartEmbedStagingBuffer.getMappedRange(0, 24*4 /*DART_BUFFERS_SIZE */);
const dartEmbedData = [...(new Uint32Array(copyDartEmbedArray.slice()))];
console.table(dartEmbedData);