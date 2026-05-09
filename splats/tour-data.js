export const VIEWER_VERSION = '1.22.0';

export const SPLAT_SOURCE = {
    // This SuperSplat export stays remote for now. Rendering still happens in the visitor's browser.
    // For a local export, drop it under splats/assets/ and point this at './assets/name/meta.json'.
    contentUrl: 'https://d28zzqy0iyovbz.cloudfront.net/a444ab39/v1/meta.json',
    posterUrl: 'https://s3-eu-west-1.amazonaws.com/images.playcanvas.com/splat/a444ab39/v1/xl.webp'
};

export const TOUR_STOPS = [
    {
        title: 'Start',
        text: 'A first framed view of the splat. Replace this copy with the opening beat of your guided tour.',
        camera: {
            initial: {
                position: [0, 2, 0],
                target: [2, 2, 0],
                fov: 75
            }
        }
    },
    {
        title: 'Wide Context',
        text: 'This stop pulls back so visitors can understand the full scan before you point out smaller details.',
        camera: {
            initial: {
                position: [4.6, 2.4, 3.2],
                target: [0, 1.7, 0],
                fov: 70
            }
        }
    },
    {
        title: 'Overhead Read',
        text: 'Use this angle for layout, paths, structure, or anything that benefits from a more diagram-like view.',
        camera: {
            initial: {
                position: [1.2, 5.2, -2.8],
                target: [0, 1.2, 0],
                fov: 68
            }
        }
    },
    {
        title: 'Detail Pass',
        text: 'Move this camera near the part of the splat you want people to inspect closely.',
        camera: {
            initial: {
                position: [-3.8, 2, -3.4],
                target: [0, 1.8, 0],
                fov: 62
            }
        }
    }
];

export const VIEWER_SETTINGS = {
    version: 2,
    tonemapping: 'aces2',
    highPrecisionRendering: true,
    background: {
        color: [0.9098039215686274, 0.21176470588235294, 0.21176470588235294]
    },
    postEffectSettings: {
        sharpness: { enabled: true, amount: 1 },
        bloom: { enabled: true, intensity: 0.04, blurLevel: 2 },
        grading: { enabled: true, brightness: 1.08, contrast: 1, saturation: 1, tint: [1, 1, 1] },
        vignette: { enabled: false, intensity: 0.5, inner: 0.3, outer: 0.75, curvature: 1 },
        fringing: { enabled: true, intensity: 38 }
    },
    animTracks: [],
    cameras: [{ initial: TOUR_STOPS[0].camera.initial }],
    annotations: [],
    startMode: 'default'
};
