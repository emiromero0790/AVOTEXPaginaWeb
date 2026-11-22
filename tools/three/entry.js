/*
 * Subconjunto de three.js que usa la capa decorativa de AVOTEX (avotex-escena3d.js).
 * Se empaqueta con tools/three/build.sh en assets/vendor/three/three.avotex.min.js.
 * Si la escena necesita otra clase, agrégala aquí y vuelve a ejecutar el script.
 */
export {
    WebGLRenderer,
    Scene,
    PerspectiveCamera,
    BufferGeometry,
    BufferAttribute,
    LineSegments,
    Points,
    ShaderMaterial,
    AdditiveBlending,
    Color,
    Timer,
    REVISION
} from 'three';
