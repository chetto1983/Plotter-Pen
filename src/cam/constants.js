/**
 * CAM Module Constants
 * Centralized tolerance and configuration values.
 */

export const TOLERANCE = {
    POINT_MATCH: 0.001,      // mm - point equality check
    ARC_FIT: 0.0001,         // mm - arc fitting precision
    AREA_EPSILON: 0.0001,    // mm² - polygon area check
    SEGMENT_CONNECT: 0.01,   // mm - segment chaining tolerance
    ARC_LINEARIZE: 0.05      // mm - arc linearization chord error (relaxed for performance)
};

export const SCALE = {
    CLIPPER: 10000           // Integer scale for Clipper operations
};

export const LIMITS = {
    POCKETING_ITERATIONS: 500,  // Max iterations for pocketing loop
    MAX_ARC_SEGMENTS: 2048      // Max segments for arc linearization
};
