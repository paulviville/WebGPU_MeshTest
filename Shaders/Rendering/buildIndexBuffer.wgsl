/// darts are defined by topological relations
struct Dart {
	phi_1: u32,
	phi1: u32,
	phi2: u32,
	phi3: u32,
}

/// dart embeddings for cmap2
struct Embeds2 {
	vertex: u32,
	edge: u32,
	face: u32,
	volume: u32,
}

struct Cells {
	darts: u32,
	vertices: u32,
	edges: u32,
	faces: u32,
	volumes: u32,
}


@group(0) @binding(0)
var <storage, read_write> darts : array<Dart>;
@group(0) @binding(1)
var <storage, read_write> embeds : array<Embeds2>;
@group(0) @binding(2)
var <uniform> nbCells : Cells;
@group(0) @binding(3)
var <storage, read_write> faceDarts : array<u32>;

@group(1) @binding(0)
var<storage, read_write> faceOffsets : array<u32>;
@group(1) @binding(1)
var<storage, read_write> indexBuffer : array<u32>;
/// additional bindings
/// face attribute : offsets storage read/write
/// index buffer : storage write

override WORKGROUP_SIZE : u32 = 64u;


fn faceDegree(fd : u32) -> u32 {
	var d = fd;
	var degree = 0u;
	loop {
		degree++;

		continuing {
			d = darts[d].phi1;
			break if (d == fd);
		}
	}
	return degree;
}

/// for each face count the number of triangles, offset[face] = 3*nbTriangles <=> 3*(degree(face) - 2)
@compute @workgroup_size(WORKGROUP_SIZE)
fn computePerFaceOffset(@builtin(global_invocation_id) globalId : vec3<u32>) {
	if(globalId.x >= nbCells.faces) {
		return;
	}

	let fd = faceDarts[globalId.x];
	faceOffsets[globalId.x] = faceDegree(fd);
}

/// goes through the list of face offsets and sums them in place
@compute @workgroup_size(1)
fn reduceOffsets() {

}
/// LATER: reduce per chunk? Would require multiple runs and a buffer containing chunk offsets

/// compute triangle indices and write them at the proper offset of the EBO
@compute @workgroup_size(WORKGROUP_SIZE)
fn computePerFaceTriangleIndices(@builtin(global_invocation_id) globalId : vec3<u32>) {

}



/// BASIC TRIANGLE FAN PER FACE
/// - count degree of faces
/// - nb triangles per face = degree(face) - 2
/// - compute offset per face
/// - per face fan written to EBO


/// BASIC EAR CLIPPING
/// - count degree of faces
/// - nb triangles per face = degree(face) - 2
/// - compute offset per face
/// - reduce/sum offsets
/// - per face ear clipping written to EBO
///
/// requires a dart marker (storage read_write)