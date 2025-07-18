import React, { useState, useEffect, useRef } from 'react';
import './Player.css';
import io from 'socket.io-client';
import { SERVER_URL } from '../config';

const socket = io(SERVER_URL, {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  autoConnect: true
});

const Player = () => {
  const [users, setUsers] = useState([]);
  const [audioURL, setAudioURL] = useState(null);
  const audioRef = useRef(null);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const [canSyncPlay, setCanSyncPlay] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const calibrationSamples = useRef([]);
  const calibrationTimeout = useRef(null);
  const playTimeout = useRef(null);
  const audioContext = useRef(null);
  const audioSource = useRef(null);
  const MAX_CALIBRATION_SAMPLES = 3; // Reduced from 5 to 3
  const CALIBRATION_TIMEOUT = 10000; // 10 seconds timeout
  const SAMPLE_INTERVAL = 1000; // 1 second between samples
  // Calibration queue logic
  const calibrationQueue = useRef([]);
  const isCalibratingGlobal = useRef(false);

  // Initialize audio context
  useEffect(() => {
    const initAudioContext = async () => {
      try {
        audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
        // Resume audio context if it's suspended (browser policy)
        if (audioContext.current.state === 'suspended') {
          await audioContext.current.resume();
        }
      } catch (error) {
        console.error('Error initializing audio context:', error);
      }
    };

    initAudioContext();

    return () => {
      if (audioContext.current) {
        audioContext.current.close();
      }
    };
  }, []);

  // Handle socket connection events
  useEffect(() => {
    const handleConnect = () => {
      console.log('Connected to server');
      setConnectionStatus('connected');
    };

    const handleDisconnect = () => {
      console.log('Disconnected from server');
      setConnectionStatus('disconnected');
    };

    const handleReconnect = (attemptNumber) => {
      console.log(`Reconnecting to server (attempt ${attemptNumber})`);
      setConnectionStatus('reconnecting');
    };

    const handleReconnectError = (error) => {
      console.error('Reconnection error:', error);
      setConnectionStatus('error');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('reconnect', handleReconnect);
    socket.on('reconnect_error', handleReconnectError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('reconnect', handleReconnect);
      socket.off('reconnect_error', handleReconnectError);
    };
  }, []);

  // Modified calibrateTime to support queue
  const calibrateTime = () => {
    // If another calibration is in progress, queue this calibration
    if (isCalibratingGlobal.current) {
      calibrationQueue.current.push(() => calibrateTime());
      return;
    }
    isCalibratingGlobal.current = true;
    // Clear any existing calibration
    if (calibrationTimeout.current) {
      clearTimeout(calibrationTimeout.current);
    }
    calibrationSamples.current = [];
    setIsCalibrating(true);
    // Set a timeout to prevent infinite calibration
    calibrationTimeout.current = setTimeout(() => {
      if (isCalibrating) {
        setIsCalibrating(false);
        isCalibratingGlobal.current = false;
        // Use the last known offset or default to 0
        if (calibrationSamples.current.length > 0) {
          const avgOffset = calibrationSamples.current.reduce((a, b) => a + b, 0) / calibrationSamples.current.length;
          setServerTimeOffset(avgOffset);
        }
        // Start next in queue if any
        if (calibrationQueue.current.length > 0) {
          const next = calibrationQueue.current.shift();
          setTimeout(next, 500); // Small delay between calibrations
        }
      }
    }, CALIBRATION_TIMEOUT);
    // Function to take a single sample
    const takeSample = () => {
      if (calibrationSamples.current.length < MAX_CALIBRATION_SAMPLES) {
        socket.emit('request_current_server_time');
      }
    };
    // Take first sample immediately
    takeSample();
    // Schedule remaining samples
    const sampleInterval = setInterval(() => {
      if (calibrationSamples.current.length < MAX_CALIBRATION_SAMPLES) {
        takeSample();
      } else {
        clearInterval(sampleInterval);
      }
    }, SAMPLE_INTERVAL);
    // Clean up interval if component unmounts during calibration
    return () => clearInterval(sampleInterval);
  };

  useEffect(() => {
    const handleTimeResponse = (serverTime) => {
      if (!isCalibrating) return;
      const clientTime = Date.now();
      const roundTripTime = clientTime - serverTime;
      const offset = roundTripTime / 2;
      calibrationSamples.current.push(offset);
      // If we have enough samples, complete calibration
      if (calibrationSamples.current.length >= MAX_CALIBRATION_SAMPLES) {
        const avgOffset = calibrationSamples.current.reduce((a, b) => a + b, 0) / MAX_CALIBRATION_SAMPLES;
        setServerTimeOffset(avgOffset);
        setIsCalibrating(false);
        isCalibratingGlobal.current = false;
        if (calibrationTimeout.current) {
          clearTimeout(calibrationTimeout.current);
        }
        // Start next in queue if any
        if (calibrationQueue.current.length > 0) {
          const next = calibrationQueue.current.shift();
          setTimeout(next, 500); // Small delay between calibrations
        }
      }
    };
    socket.on('current_time_server', handleTimeResponse);
    return () => {
      socket.off('current_time_server', handleTimeResponse);
      if (calibrationTimeout.current) {
        clearTimeout(calibrationTimeout.current);
      }
    };
  }, [isCalibrating]);

  const syncPlay = () => {
    socket.emit('request_time_to_play');
    console.log("Time synchronization requested");
  };

  useEffect(() => {
    socket.on('song_url', (url) => {
      setAudioURL(url);
      console.log(`Received song URL: ${url}`);
    });

    return () => {
      socket.off('song_url');
    };
  }, []);

  useEffect(() => {
    const handleCountdown = (remainingTime) => {
      setCountdown(Math.ceil(remainingTime / 1000));
    };

    const handlePlayNow = async ({ startTime, songUrl, serverTime }) => {
      if (!audioContext.current) return;

      try {
        // Resume audio context if it's suspended
        if (audioContext.current.state === 'suspended') {
          await audioContext.current.resume();
        }

        // Create a new audio source
        if (audioSource.current) {
          audioSource.current.disconnect();
        }

        // Fetch the audio file
        const response = await fetch(songUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.current.decodeAudioData(arrayBuffer);

        // Create and configure the audio source
        audioSource.current = audioContext.current.createBufferSource();
        audioSource.current.buffer = audioBuffer;
        audioSource.current.connect(audioContext.current.destination);

        // Calculate precise start time
        const now = audioContext.current.currentTime;
        const startDelay = Math.max(0, (startTime - Date.now() + serverTimeOffset) / 1000);
        
        // Start playback with precise timing
        audioSource.current.start(now + startDelay);
        console.log('Playing now with precise timing!');
      } catch (error) {
        console.error('Error playing audio:', error);
      }
      
      setCountdown(null);
    };

    socket.on('countdown', handleCountdown);
    socket.on('play_now', handlePlayNow);

    return () => {
      socket.off('countdown', handleCountdown);
      socket.off('play_now', handlePlayNow);
    };
  }, [serverTimeOffset]);

  useEffect(() => {
    const playAudioAtTime = (targetTime) => {
      const now = Date.now();
      const timeToWait = targetTime - now - serverTimeOffset;

      // Compensate for network jitter with a smaller buffer
      const jitterBuffer = 20; // Reduced buffer for better precision

      if (playTimeout.current) {
        clearTimeout(playTimeout.current);
      }

      const play = () => {
        if (audioRef.current) {
          audioRef.current.play();
          socket.emit('playback_started', Date.now() - serverTimeOffset);
        }
      };

      if (timeToWait > jitterBuffer) {
        playTimeout.current = setTimeout(play, timeToWait - jitterBuffer);
      } else {
        play();
      }
    };

    socket.on('time_to_play_at', (targetTime) => {
      console.log("Requested time to play at (server time):", targetTime);
      playAudioAtTime(targetTime);
    });

    return () => {
      socket.off('time_to_play_at');
      if (playTimeout.current) {
        clearTimeout(playTimeout.current);
      }
    };
  }, [serverTimeOffset]);

  useEffect(() => {
    socket.on('users', (users) => {
      setUsers(users);
    });

    return () => {
      socket.off('users');
    };
  }, []);

  const handleProgress = () => {
    const audio = audioRef.current;
  
    if (audio) {
      const buffered = audio.buffered;
      if (buffered.length > 0) {
        setCanSyncPlay(false);
        const percentLoaded = (buffered.end(0) / audio.duration) * 100;
        console.log(`Audio loaded: ${percentLoaded.toFixed(2)}%`);
        if (percentLoaded < 20) {
          setCanSyncPlay(false);
        }
        if (percentLoaded >= 20) {
          setCanSyncPlay(true);
        }
      }
    }
  };

  // Automatically calibrate time on component mount
  useEffect(() => {
    calibrateTime();
    // Clean up calibration interval if component unmounts
    return () => {
      if (calibrationTimeout.current) {
        clearTimeout(calibrationTimeout.current);
      }
    };
  }, []);

  return (
    <div className="player-container">
      <div className='text'>
        <span className="fancy">{users.length / 2} </span> USERS CONNECTED!
      </div>
      {connectionStatus !== 'connected' && (
        <div className="connection-status">
          {connectionStatus === 'connecting' && 'Connecting to server...'}
          {connectionStatus === 'disconnected' && 'Disconnected from server'}
          {connectionStatus === 'reconnecting' && 'Reconnecting to server...'}
          {connectionStatus === 'error' && 'Connection error'}
        </div>
      )}
      {audioURL && (
        <audio ref={audioRef} controls src={audioURL} preload="auto" onProgress={handleProgress}></audio>
      )}
      {countdown !== null && (
        <div className="countdown">
          Playing in {countdown}...
        </div>
      )}
      {canSyncPlay && (
        <button className='button' onClick={syncPlay} disabled={!canSyncPlay || connectionStatus !== 'connected'}>
          PLAY IN SYNC
        </button>
      )}
      {/* Calibration status button */}
      <button
        className='button'
        style={{
          backgroundColor: !isCalibrating ? 'green' : 'gray',
          color: 'white',
          cursor: 'default',
          opacity: 1,
          pointerEvents: 'none',
        }}
        disabled
      >
        {!isCalibrating ? 'CALIBRATED' : 'CALIBRATING...'}
      </button>
    </div>
  );
};

export default Player;
