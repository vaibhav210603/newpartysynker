import React, { useState } from 'react';
import './admin.css';
import io from 'socket.io-client';
import { SERVER_URL } from '../config';

const socket = io(SERVER_URL);

export default function Admin() {
  const [flag, setFlag] = useState(false);
  const [selectedSong, setSelectedSong] = useState('believer.mp3'); // Default selected song

  const handlePlay = () => {
    socket.emit('select_song', selectedSong);
    setFlag(false);
    
  };

  return (
    <div>
      <div ontouchstart="">
        <div className="control">
          <a onClick={() => setFlag(!flag)} href="#">CONTROLS</a>
        </div>
      </div>

      {flag && (
        <div className='dialogbox'>
          <div className='musicSelector'>
            <label htmlFor="song-names">Choose a song:</label>
            <select
              className='dropdown'
              name="song-names"
              id="song-names"
              value={selectedSong}
              onChange={(e) => setSelectedSong(e.target.value)}
            >
              <option value="believer.mp3">Believer</option>
              <option value="hotlinebling.mp3">Hotline Bling</option>
              <option value="bigdawgs.mp3">Big Dawgs</option>
              <option value="jobhimai.mp3">Jo Bhi Mai</option>
              <option value="manjha.mp3">Manjha</option>
              <option value="milliondollarbaby.mp3">Million Dollar Baby</option>
              <option value="rollinginthedeep.mp3">Rolling in the deep</option>
              <option value="houseofmemories.mp3">House Of Memories</option>
            </select>
          </div>
          <button className='select' onClick={handlePlay}>Play</button>
        </div>
      )}
    </div>
  );
}
