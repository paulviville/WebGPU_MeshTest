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

@group(0) @binding(0)
var <storage, read> map : array<Darts>;
@group(0) @binding(1)
var <storage, read> map : array<Embeds2>;

/// additional bindings
/// face attribute : offsets storage read/write
/// index buffer : storage write

override WORKGROUP_SIZE : 64u;


fn faceDegree(fd : Dart) -> u32 {

	return 0;
}

/// for each face count the number of triangles, offset[face] = 3*nbTriangles <=> 3*(degree(face) - 2)
@compute @workgroup_size(WORKGROUP_SIZE)
fn computePerFaceOffset(@builtin(global_invocation_id) globalId : vec3<u32>) {

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