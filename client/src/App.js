
import './App.css';

import { useEffect, useState } from 'react';
import ThreeDModel from './components/ThreeDModel';

import MainComponent from './components/MainComponent';
import Loading from './components/Loading';


function App() {

  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    setTimeout(()=>{
      setLoading(false);
    },2000)
  })
  return (
    <div className="App">
      {loading && <Loading></Loading>}
      <MainComponent/>
     
    </div>
  );
}

export default App;
