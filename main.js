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
console.log( device.limits)



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
	usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
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
// console.log(dartPhiArray);

/// dart cell embeddings, vec4u(vertex2, edge2, face2, volume) 
const dartEmbedArray = new Uint32Array(cmap.nbDarts() * 4);
cmap.foreachDart(d => {
	dartEmbedArray[4*d] = cmap.cell(cmap.vertex, d);
	dartEmbedArray[4*d+1] = cmap.cell(cmap.edge, d);
	dartEmbedArray[4*d+2] = cmap.cell(cmap.face, d);
	dartEmbedArray[4*d+3] = cmap.cell(cmap.volume, d);
})
// console.log(dartEmbedArray);

const MAX_DARTS = 100000;
const DART_BUFFERS_SIZE = MAX_DARTS * 4 * Uint32Array.BYTES_PER_ELEMENT;
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

const MAX_VERTICES = parseInt(MAX_DARTS / 3);
const positionBuffer = device.createBuffer({
	label: "position/vertex buffer",
	size: MAX_VERTICES * 4 * Float32Array.BYTES_PER_ELEMENT,
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
///

const MAX_FACES = parseInt(MAX_VERTICES / 3);
/// first dart of each face
const faceDartBuffer = device.createBuffer({
	label: "face darts buffer",
	size: MAX_FACES * Uint32Array.BYTES_PER_ELEMENT,
	usage: GPUBufferUsage.STORAGE,
	mappedAtCreation: true,
});

const faceDarts = new Uint32Array(faceDartBuffer.getMappedRange());
cmap.foreach(cmap.face, fd => {
	faceDarts[cmap.cell(cmap.face, fd)] = fd;
});
const facedartsData = [...(new Uint32Array(faceDarts.slice()))];
console.log(facedartsData)
faceDartBuffer.unmap();

const faceOffsetBuffer = device.createBuffer({
	label: "face offset buffer",
	size: MAX_FACES * Uint32Array.BYTES_PER_ELEMENT,
	usage: GPUBufferUsage.STORAGE,
});

const indexBuffer = device.createBuffer({
	label: "index buffer",
	size: 5*MAX_FACES * Uint32Array.BYTES_PER_ELEMENT,
	usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.INDEX,
});




const WORKGROUP_SIZE = 64;


/// Creation of the initial EBO
const buildIndexBufferCode = await fetch("./Shaders/Rendering/buildIndexBuffer.wgsl").then(response => response.text());
// console.log(buildIndexBufferCode)
const buildIndexBufferModule = device.createShaderModule({
	label: "build index buffer shader module",
	code: buildIndexBufferCode,
});

const mapBindGroupLayout = device.createBindGroupLayout({
	label: 'map bind group layout',
	entries: [
		{ /// darts topology
			binding: 0,
			visibility: GPUShaderStage.COMPUTE,
			buffer: {
				type: 'storage',
			},
		},
		{ /// embeddings
			binding: 1,
			visibility: GPUShaderStage.COMPUTE,
			buffer: {
				type: 'storage',
			},
		},
		{ /// nb cells uniform
			binding: 2,
			visibility: GPUShaderStage.COMPUTE,
			buffer: { },
		},
		{ /// face Darts
			binding: 3,
			visibility: GPUShaderStage.COMPUTE,
			buffer: { 
				type: 'storage',
			},
		},

		
	],
});

const buildIndexBufferBindGroupLayout = device.createBindGroupLayout({
	label: 'build index buffer bind group layout',
	entries: [
		{ /// faceOffsets
			binding: 0,
			visibility: GPUShaderStage.COMPUTE,
			buffer: {
				type: 'storage',
			}
		},
		{ /// indexBuffer
			binding: 1,
			visibility: GPUShaderStage.COMPUTE,
			buffer: {
				type: 'storage',
			}
		},
	],
});

const mapBindGroup = device.createBindGroup({
	label: 'map bind group',
	layout: mapBindGroupLayout,
	entries: [{
		binding: 0,
		resource: { buffer: dartPhiBuffer },
	},
	{
		binding: 1,
		resource: { buffer: dartEmbedBuffer },
	},
	{
		binding: 2,
		resource: { buffer: cellInfoBuffer },
	},
	{
		binding: 3,
		resource: { buffer: faceDartBuffer },
	},
	]
});

const buildIndexBufferBindGroup = device.createBindGroup({
	label: 'build index buffer bind group',
	layout: buildIndexBufferBindGroupLayout,
	entries: [{
		binding: 0,
		resource: { buffer: faceOffsetBuffer },
	},
	{
		binding: 1,
		resource: { buffer: indexBuffer },
	},
	]
});

const buildIndexBufferPipelineLayout = device.createPipelineLayout({
	label: 'build index buffer pipeline layout',
	bindGroupLayouts: [
		mapBindGroupLayout,
		buildIndexBufferBindGroupLayout,
	],
});

const computePerFaceOffsetPipeline = device.createComputePipeline({
	label: 'compute per face offset pipeline',
	layout: buildIndexBufferPipelineLayout,
	compute: {
		module: buildIndexBufferModule,
		entryPoint: 'computePerFaceOffset',
		constants: {
			WORKGROUP_SIZE,
		}
	}
});












const commandEncoder = device.createCommandEncoder();
const passEncoder = commandEncoder.beginComputePass();
passEncoder.end();



/// DEBUG
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
///

const commands = commandEncoder.finish();
device.queue.submit([commands]);



/// DEBUG
await dartPhiStagingBuffer.mapAsync(
	GPUMapMode.READ,
	0,
	24*4,
	// DART_BUFFERS_SIZE,
);

const copyDartPhiArray = dartPhiStagingBuffer.getMappedRange(0, 24*4 /*DART_BUFFERS_SIZE */);
const dartPhiData = [...(new Uint32Array(copyDartPhiArray.slice()))];
// console.table(dartPhiData);

await dartEmbedStagingBuffer.mapAsync(
	GPUMapMode.READ,
	0,
	24*4,
	// DART_BUFFERS_SIZE,
);

const copyDartEmbedArray = dartEmbedStagingBuffer.getMappedRange(0, 24*4 /*DART_BUFFERS_SIZE */);
const dartEmbedData = [...(new Uint32Array(copyDartEmbedArray.slice()))];
// console.table(dartEmbedData);
///