/**
 * react-three-fiber's JSX intrinsics.
 *
 * R3F augments React's JSX namespace from its own type entry point, but only if
 * something in the program actually imports it. Nothing does at type level —
 * every component imports values, not types — so the augmentation is pulled in
 * explicitly here once, for the whole project.
 */
import type {} from '@react-three/fiber'
