import React, {useEffect, useRef, useState} from 'react';
import {useGym, Icon} from './ui.jsx';

function useAsset(exercise, kind, enabled, attempt = 0) {
  const {media} = useGym();
  const key = exercise?.id + ':' + kind;
  const [state, setState] = useState({key: null, url: null, error: false});
  useEffect(() => {
    let alive = true, lease;
    setState({key, url: null, error: false});
    if (!enabled || !media || !exercise?.id || exercise.id.startsWith('custom-')) return;
    media.acquire(exercise.id, kind).then(value => {
      if (!alive) { value?.release(); return; }
      lease = value;
      setState({key, url: value?.url || null, error: !value});
    }, () => { if (alive) setState({key, url: null, error: true}); });
    return () => { alive = false; lease?.release(); };
  }, [media, exercise?.id, kind, enabled, attempt]);
  return state.key === key && enabled ? state : {url: null, error: false};
}

export function ExerciseThumb({exercise}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  const [broken, setBroken] = useState(null);
  useEffect(() => {
    if (!ref.current || visible) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, {rootMargin: '200px'});
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);
  const still = useAsset(exercise, 'still', visible);
  return <span ref={ref} className={`thumb exercise-thumb ${still.url ? '' : 'empty-thumb'}`}>
    {still.url && broken !== still.url ? <img src={still.url} alt="" decoding="async" draggable={false} onError={() => setBroken(still.url)}/> : <Icon name="workout" size={23}/>}
  </span>;
}

function autoplay(video) {
  if (!video) return;
  video.muted = true;
  video.defaultMuted = true;
  video.setAttribute('muted', '');
  video.play()?.catch(() => {});
}

export function ExerciseAnimation({exercise, minimizable = false}) {
  const {store, run, media} = useGym();
  const [playing, setPlaying] = useState(true), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const size = minimizable ? store.setting('mediaSize', 'full') : 'full';
  const enabled = size !== 'off';
  const still = useAsset(exercise, 'still', enabled, attempt);
  const clip = useAsset(exercise, 'clip', enabled && playing && !failed, attempt);
  useEffect(() => { setPlaying(true); setFailed(false); }, [exercise?.id]);
  if (!enabled || !media || !exercise || exercise.id?.startsWith('custom-')) return null;
  const retry = () => { setFailed(false); setAttempt(n => n + 1); setPlaying(true); };
  const onTap = () => (failed || clip.error) ? retry() : setPlaying(value => !value);
  const mini = size === 'mini';
  return <div className={`exmedia exercise-animation ${mini ? 'mini' : ''}`}>
    <button type="button" className="animation-surface" onClick={onTap} aria-label={`${playing ? '暂停' : '播放'} ${exercise.name} 动作演示`}>
      {playing && !failed && clip.url ? <video className="catvid" key={clip.url} ref={autoplay} src={clip.url} autoPlay muted loop playsInline disablePictureInPicture aria-label={`${exercise.name} 动作演示`} onError={() => setFailed(true)}/>
        : still.url ? <img src={still.url} alt={`${exercise.name} 动作图示`} draggable={false}/>
        : <span className="animation-placeholder"><Icon name="workout" size={38}/><small>{still.error || clip.error ? '暂时无法加载，点击重试' : '正在加载动作演示…'}</small></span>}
      {!mini && <span className="gifhint animation-hint"><Icon name={playing && !failed ? 'pause' : 'play'} size={13}/>{failed || clip.error ? '点击重试' : playing ? '点击暂停' : '点击播放'}</span>}
    </button>
    {minimizable && <button type="button" className="giftoggle animation-size" onClick={() => run(async () => { store.setSetting('mediaSize', mini ? 'full' : 'mini'); if (!await store.flush()) throw new Error(store.error); })}>{mini ? '展开' : '收起'}</button>}
  </div>;
}
