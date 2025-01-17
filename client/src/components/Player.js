import React, { useState, useEffect, useRef } from 'react';
import './Player.css';
import io from 'socket.io-client';

const socket = io('http://localhost:5000/');

const Player = () => {
  const [users, setUsers] = useState([]);
  const [audioURL, setAudioURL] = useState(null);
  const audioRef = useRef(null);
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const [canSyncPlay, setCanSyncPlay] = useState(false);

const calibrateTime = () => {
  socket.emit('request_current_server_time');
  
};

let extra_time=0;

useEffect(()=>{

  socket.on('current_time_server', (now_time_server) => {
    
    const now_time_client = Date.now();
    
    console.log("Client time at request:", now_time_client);
    console.log("Current server time is:", now_time_server);

    extra_time=now_time_client-now_time_server;
    console.log("end device is ahead by:",extra_time);
  });


  return ()=>{
    socket.off('current_time_server');
  }

},[]);

 

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
      socket.off('song_url'); // Cleanup the event listener
    };
  }, []);


  

  useEffect(() => {

    const playAudioAtTime = (delayedTime) => {
      const clientPlayTime = delayedTime;
      const now = Date.now();
      const timeToWait = clientPlayTime - now;

      // Compensate for network jitter by adding a buffer
      const jitterBuffer = 50; // Add a small buffer in milliseconds

      const play = () => {
        if (audioRef.current) {
          audioRef.current.play();
          // Send playback start time to server
          socket.emit('playback_started', Date.now());
        }
      };

      if (timeToWait > jitterBuffer) {
        setTimeout(play, timeToWait - jitterBuffer - extra_time);
          //BECAUSE THE CLIENT SIDE IS AHEAD BY "EXTRA-TIME", WE REDUCE THE TIME OF PLLAYBACK NOT EXACTLY BY 3 SECONDS BUT LESS(TIME RECEIVED BY SERVER IS 3 SEC)
      } else {
        play();
      }
    };

    socket.on('time_to_play_at', (delayedTime) => {
      console.log("Requested time to play at (server time):", delayedTime);
      playAudioAtTime(delayedTime); // Schedule playback to start at delayed_time
    });

    return () => {
      socket.off('time_to_play_at'); // Cleanup the event listener
    };
  }, [serverTimeOffset]);





  // Updating connected users...
  useEffect(() => {
    socket.on('users', (users) => {
      setUsers(users);
    });

    return () => {
      socket.off('users'); // Cleanup the event listener
    };
  }, []);

  
  // Track audio loading progress
  const handleProgress = () => {
    const audio = audioRef.current;
  
    if (audio) {
   
      const buffered = audio.buffered;
      if (buffered.length > 0) {
        setCanSyncPlay(false)
        const percentLoaded = (buffered.end(0) / audio.duration) * 100;
        console.log(`Audio loaded: ${percentLoaded.toFixed(2)}%`);
        if (percentLoaded < 20)
        setCanSyncPlay(false);
        if (percentLoaded >= 20) {
          setCanSyncPlay(true);
        }
      }
    }
  };

  return (
    <div className="player-container">
      <div className='text'>
        <span className="fancy">{users.length / 2} </span> USERS CONNECTED!
      </div>
      {audioURL && (
        <audio ref={audioRef} controls src={audioURL} preload="auto" onProgress={handleProgress}></audio>
      )}
      {canSyncPlay && (
        <button className='button' onClick={syncPlay} disabled={!canSyncPlay}>
          PLAY IN SYNC
        </button>
      )}

      <button className='button'  onClick={calibrateTime}>CALIBRATE</button>
    </div>
  );
};

export default Player;
