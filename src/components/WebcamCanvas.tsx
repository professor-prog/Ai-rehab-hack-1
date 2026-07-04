'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
// Force chunk re-compilation
import { PoseData, Landmark3D, PoseLandmark } from '@/types';
import { Pose } from '@mediapipe/pose';

export interface WebcamCanvasProps {
    onPoseDetected: (pose: PoseData | null) => void;
    showLandmarks?: boolean;
    width?: number;
    height?: number;
}

// Pose connections for drawing skeleton
const POSE_CONNECTIONS: [PoseLandmark, PoseLandmark][] = [
    // Face
    [PoseLandmark.NOSE, PoseLandmark.LEFT_EYE],
    [PoseLandmark.NOSE, PoseLandmark.RIGHT_EYE],
    [PoseLandmark.LEFT_EYE, PoseLandmark.LEFT_EAR],
    [PoseLandmark.RIGHT_EYE, PoseLandmark.RIGHT_EAR],
    // Torso
    [PoseLandmark.LEFT_SHOULDER, PoseLandmark.RIGHT_SHOULDER],
    [PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_HIP],
    [PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_HIP],
    [PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP],
    // Left arm
    [PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_ELBOW],
    [PoseLandmark.LEFT_ELBOW, PoseLandmark.LEFT_WRIST],
    [PoseLandmark.LEFT_WRIST, PoseLandmark.LEFT_PINKY],
    [PoseLandmark.LEFT_WRIST, PoseLandmark.LEFT_INDEX],
    [PoseLandmark.LEFT_WRIST, PoseLandmark.LEFT_THUMB],
    [PoseLandmark.LEFT_PINKY, PoseLandmark.LEFT_INDEX],
    // Right arm
    [PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_ELBOW],
    [PoseLandmark.RIGHT_ELBOW, PoseLandmark.RIGHT_WRIST],
    [PoseLandmark.RIGHT_WRIST, PoseLandmark.RIGHT_PINKY],
    [PoseLandmark.RIGHT_WRIST, PoseLandmark.RIGHT_INDEX],
    [PoseLandmark.RIGHT_WRIST, PoseLandmark.RIGHT_THUMB],
    [PoseLandmark.RIGHT_PINKY, PoseLandmark.RIGHT_INDEX],
    // Left leg
    [PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_KNEE],
    [PoseLandmark.LEFT_KNEE, PoseLandmark.LEFT_ANKLE],
    [PoseLandmark.LEFT_ANKLE, PoseLandmark.LEFT_HEEL],
    [PoseLandmark.LEFT_ANKLE, PoseLandmark.LEFT_FOOT_INDEX],
    [PoseLandmark.LEFT_HEEL, PoseLandmark.LEFT_FOOT_INDEX],
    // Right leg
    [PoseLandmark.RIGHT_HIP, PoseLandmark.RIGHT_KNEE],
    [PoseLandmark.RIGHT_KNEE, PoseLandmark.RIGHT_ANKLE],
    [PoseLandmark.RIGHT_ANKLE, PoseLandmark.RIGHT_HEEL],
    [PoseLandmark.RIGHT_ANKLE, PoseLandmark.RIGHT_FOOT_INDEX],
    [PoseLandmark.RIGHT_HEEL, PoseLandmark.RIGHT_FOOT_INDEX],
];

export default function WebcamCanvas({
    onPoseDetected,
    showLandmarks = true,
    width = 640,
    height = 480,
}: WebcamCanvasProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameRef = useRef<number>();
    const poseRef = useRef<any>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [fps, setFps] = useState(0);
    const [isAligned, setIsAligned] = useState(false);
    const [showRepFlash, setShowRepFlash] = useState(false);
    const prevRepCountRef = useRef(0);

    // Keep latest callbacks in refs to avoid stale closures
    const onPoseDetectedRef = useRef(onPoseDetected);
    const showLandmarksRef = useRef(showLandmarks);
    useEffect(() => { onPoseDetectedRef.current = onPoseDetected; }, [onPoseDetected]);
    useEffect(() => { showLandmarksRef.current = showLandmarks; }, [showLandmarks]);

    const frameCountRef = useRef(0);
    const lastFpsUpdateRef = useRef(Date.now());
    const isRunningRef = useRef(false);

    // Initialize MediaPipe Pose — stable, runs once
    const initializePose = useCallback(async () => {
        try {
            poseRef.current = new Pose({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`;
                },
            });

            poseRef.current.setOptions({
                modelComplexity: 1,
                smoothLandmarks: true,
                enableSegmentation: false,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });

            // Use refs for callbacks to avoid stale closures causing re-init
            poseRef.current.onResults((results: any) => {
                frameCountRef.current++;

                const now = Date.now();
                if (now - lastFpsUpdateRef.current >= 1000) {
                    setFps(frameCountRef.current);
                    frameCountRef.current = 0;
                    lastFpsUpdateRef.current = now;
                }

                if (results.poseLandmarks) {
                    const landmarks: Landmark3D[] = results.poseLandmarks.map((lm: any, index: number) => {
                        const worldLm = results.poseWorldLandmarks?.[index];
                        return {
                            x: lm.x,
                            y: lm.y,
                            z: worldLm?.z ?? lm.z ?? 0,
                            visibility: lm.visibility ?? 1,
                        };
                    });

                    onPoseDetectedRef.current({
                        landmarks,
                        timestamp: performance.now(),
                    });

                    if (showLandmarksRef.current) {
                        drawLandmarks(landmarks);
                        checkAlignment(landmarks);
                    }
                } else {
                    onPoseDetectedRef.current(null);
                    clearCanvas();
                    setIsAligned(false);
                }
            });

            await poseRef.current.initialize();
            console.log('Pose model initialized successfully');
            setIsLoading(false);
            setError(null);
        } catch (err) {
            console.error('Failed to initialize pose detection:', err);
            if (poseRef.current) {
                console.log('Pose ref exists despite error, attempting to continue');
                setIsLoading(false);
                setError(null);
            } else {
                setError('Failed to initialize AI model. Check your internet connection and try again.');
                setIsLoading(false);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Start webcam — stable, runs once
    const startWebcam = useCallback(async () => {
        try {
            // Stop any existing stream first
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: width },
                    height: { ideal: height },
                    facingMode: 'user',
                },
            });

            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                console.log('Webcam started successfully');
                setError(null);
            }
        } catch (err) {
            console.error('Failed to access webcam:', err);
            setError('Camera access denied: ' + (err instanceof Error ? err.message : String(err)));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const lastProcessingTimeRef = useRef<number>(0);

    // Process video frames
    const isProcessingRef = useRef(false);

    const processFrame = useCallback(async () => {
        if (isProcessingRef.current) {
            animationFrameRef.current = requestAnimationFrame(processFrame);
            return;
        }

        const now = performance.now();
        const delta = now - lastProcessingTimeRef.current;

        // Target 24 FPS (1000/24 ≈ 41.6ms)
        if (delta >= 40) {
            if (videoRef.current && poseRef.current && videoRef.current.readyState >= 2) {
                lastProcessingTimeRef.current = now;
                isProcessingRef.current = true;
                try {
                    await poseRef.current.send({ image: videoRef.current });
                } finally {
                    isProcessingRef.current = false;
                }
            }
        }
        animationFrameRef.current = requestAnimationFrame(processFrame);
    }, []);

    // Expose a stable startProcessing that can be called after both video and pose are ready
    const startProcessingIfReady = useCallback(() => {
        if (!isRunningRef.current && poseRef.current && videoRef.current && videoRef.current.readyState >= 2) {
            isRunningRef.current = true;
            processFrame();
        }
    }, [processFrame]);

    // Draw landmarks on canvas
    const drawLandmarks = useCallback((landmarks: Landmark3D[]) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw connections
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
        ctx.lineWidth = 3;

        for (const [start, end] of POSE_CONNECTIONS) {
            const startLm = landmarks[start];
            const endLm = landmarks[end];

            if (startLm.visibility && startLm.visibility > 0.5 &&
                endLm.visibility && endLm.visibility > 0.5) {
                ctx.beginPath();
                ctx.moveTo(startLm.x * canvas.width, startLm.y * canvas.height);
                ctx.lineTo(endLm.x * canvas.width, endLm.y * canvas.height);
                ctx.stroke();
            }
        }

        // Draw landmarks
        for (let i = 0; i < landmarks.length; i++) {
            const lm = landmarks[i];
            if (lm.visibility && lm.visibility > 0.5) {
                const x = lm.x * canvas.width;
                const y = lm.y * canvas.height;

                // Outer glow
                const gradient = ctx.createRadialGradient(x, y, 0, x, y, 10);
                gradient.addColorStop(0, 'rgba(0, 255, 255, 0.8)');
                gradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(x, y, 10, 0, Math.PI * 2);
                ctx.fill();

                // Inner point
                ctx.fillStyle = '#00ffff';
                ctx.beginPath();
                ctx.arc(x, y, 5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        drawAlignmentGuide(ctx, canvas.width, canvas.height);
    }, [isAligned]);

    // Check if user is centered in frame
    const checkAlignment = useCallback((landmarks: Landmark3D[]) => {
        const shoulderL = landmarks[PoseLandmark.LEFT_SHOULDER];
        const shoulderR = landmarks[PoseLandmark.RIGHT_SHOULDER];
        const hipL = landmarks[PoseLandmark.LEFT_HIP];
        const hipR = landmarks[PoseLandmark.RIGHT_HIP];

        if (!shoulderL || !shoulderR || !hipL || !hipR) return;

        // Landmarks are normalized 0-1
        // Ideal zone: center 60% of width, 70% of height
        const withinX = (shoulderL.x > 0.1 && shoulderL.x < 0.9) && (shoulderR.x > 0.1 && shoulderR.x < 0.9);
        const withinY = (shoulderL.y > 0.1 && shoulderL.y < 0.8) && (hipL.y > 0.2 && hipL.y < 0.9);

        const aligned = withinX && withinY;
        if (aligned !== isAligned) {
            setIsAligned(aligned);
        }
    }, [isAligned]);

    // Draw the "Green Framework" guide
    const drawAlignmentGuide = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
        const marginW = width * 0.15;
        const marginH = height * 0.15;
        const rectW = width - (marginW * 2);
        const rectH = height - (marginH * 2);

        ctx.setLineDash([15, 10]);
        ctx.strokeStyle = isAligned ? 'rgba(34, 197, 94, 0.8)' : 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 4;

        // Draw main frame
        ctx.strokeRect(marginW, marginH, rectW, rectH);

        // Draw corner accents
        ctx.setLineDash([]);
        ctx.strokeStyle = isAligned ? '#22c55e' : '#64748b';
        ctx.lineWidth = 6;

        const L = 40; // Corner length

        // Top Left
        ctx.beginPath(); ctx.moveTo(marginW, marginH + L); ctx.lineTo(marginW, marginH); ctx.lineTo(marginW + L, marginH); ctx.stroke();
        // Top Right
        ctx.beginPath(); ctx.moveTo(marginW + rectW - L, marginH); ctx.lineTo(marginW + rectW, marginH); ctx.lineTo(marginW + rectW, marginH + L); ctx.stroke();
        // Bottom Left
        ctx.beginPath(); ctx.moveTo(marginW, marginH + rectH - L); ctx.lineTo(marginW, marginH + rectH); ctx.lineTo(marginW + L, marginH + rectH); ctx.stroke();
        // Bottom Right
        ctx.beginPath(); ctx.moveTo(marginW + rectW - L, marginH + rectH); ctx.lineTo(marginW + rectW, marginH + rectH); ctx.lineTo(marginW + rectW, marginH + rectH - L); ctx.stroke();

        // Label
        if (!isAligned) {
            ctx.save();
            // Flip context horizontally around the text center to un-mirror the text
            ctx.translate(width / 2, marginH);
            ctx.scale(-1, 1);

            ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
            ctx.fillRect(-80, -20, 160, 40);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('CENTER YOUR BODY', 0, 5);

            ctx.restore();
        }
    };

    // Clear canvas
    const clearCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }, []);

    // Initialize — run only once on mount
    useEffect(() => {
        initializePose();
        startWebcam();

        return () => {
            isRunningRef.current = false;
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            // Stop camera tracks via the tracked stream ref
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Fix race condition: Start processing once BOTH pose is ready AND video can play
    // This handles both orders: video-first and pose-first
    useEffect(() => {
        if (!isLoading) {
            startProcessingIfReady();
        }
    }, [isLoading, startProcessingIfReady]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleCanPlay = () => {
            startProcessingIfReady();
        };

        video.addEventListener('canplay', handleCanPlay);
        // Also try immediately in case video is already ready
        if (video.readyState >= 2) handleCanPlay();

        return () => video.removeEventListener('canplay', handleCanPlay);
    }, [startProcessingIfReady]);

    return (
        <div className="relative rounded-2xl overflow-hidden bg-slate-900 shadow-2xl">
            {/* Video feed */}
            <video
                ref={videoRef}
                width={width}
                height={height}
                className="w-full h-full object-cover transform scale-x-[-1]"
                playsInline
                muted
            />

            {/* Overlay canvas for landmarks */}
            <canvas
                ref={canvasRef}
                width={width}
                height={height}
                className="absolute inset-0 w-full h-full transform scale-x-[-1]"
            />

            {/* FPS counter */}
            <div className="absolute top-4 left-4 px-3 py-1 rounded-lg bg-black/50 backdrop-blur-sm text-cyan-400 text-sm font-mono">
                {fps} FPS
            </div>

            {/* Rep Flash Overlay — flashes green when a rep is counted */}
            {showRepFlash && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                    <div className="absolute inset-0 bg-green-500/10 animate-ping-once rounded-2xl" />
                    <div className="px-8 py-5 rounded-2xl bg-green-500/90 backdrop-blur-sm shadow-[0_0_40px_rgba(34,197,94,0.6)] flex items-center gap-3 rep-pop">
                        <span className="text-3xl">✅</span>
                        <span className="text-white text-2xl font-black tracking-tight">REP!</span>
                    </div>
                </div>
            )}

            {/* Loading overlay */}
            {isLoading && (
                <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center">
                    <div className="w-20 h-20 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin mb-6" />
                    <p className="text-white text-xl font-bold mb-2">Loading AI Model...</p>
                    <p className="text-slate-400 text-sm text-center max-w-xs">Downloading MediaPipe pose detection. This may take a moment on first load.</p>
                </div>
            )}

            {/* Error overlay */}
            {error && (
                <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center p-8">
                    <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <p className="text-white text-lg font-bold text-center mb-2">⚠️ Camera / AI Error</p>
                    <p className="text-slate-400 text-sm text-center mb-4">{error}</p>
                    <button
                        onClick={() => { setError(null); setIsLoading(true); initializePose(); startWebcam(); }}
                        className="px-6 py-2 rounded-xl bg-cyan-500 text-white font-semibold hover:bg-cyan-400 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Corner decorations */}
            <div className="absolute top-0 left-0 w-12 h-12 border-t-2 border-l-2 border-cyan-500/50 rounded-tl-2xl" />
            <div className="absolute top-0 right-0 w-12 h-12 border-t-2 border-r-2 border-cyan-500/50 rounded-tr-2xl" />
            <div className="absolute bottom-0 left-0 w-12 h-12 border-b-2 border-l-2 border-cyan-500/50 rounded-bl-2xl" />
            <div className="absolute bottom-0 right-0 w-12 h-12 border-b-2 border-r-2 border-cyan-500/50 rounded-br-2xl" />
        </div>
    );
}
