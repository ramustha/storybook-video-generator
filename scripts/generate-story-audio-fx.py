import wave
import math
import struct
import os
import random
import subprocess

def create_wav_writer(file_path, sample_rate=44100, channels=2):
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    w = wave.open(file_path, 'w')
    w.setnchannels(channels)
    w.setsampwidth(2)
    w.setframerate(sample_rate)
    return w

def write_stereo_frames(w, samples_l, samples_r):
    frames = bytearray()
    for l, r in zip(samples_l, samples_r):
        cl = max(-1.0, min(1.0, l))
        cr = max(-1.0, min(1.0, r))
        il = int(cl * 32767)
        ir = int(cr * 32767)
        frames.extend(struct.pack('<hh', il, ir))
    w.writeframes(frames)
    w.close()

def generate_sfx_suite(output_dir):
    os.makedirs(output_dir, exist_ok=True)
    sr = 44100
    rng = random.Random(42)

    # -------------------------------------------------------------
    # 0. Opener Chime (Cover)
    # -------------------------------------------------------------
    dur = 2.4
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    notes = [1046.50, 1318.51, 1567.98, 2093.00] # C6, E6, G6, C7
    for idx, f in enumerate(notes):
        st = idx * 0.18
        for i in range(int(st * sr), n):
            dt = (i - st * sr) / sr
            env = math.exp(-dt * 3.2)
            sig = (math.sin(2*math.pi*f*dt) + 0.3*math.sin(4*math.pi*f*dt)) * env * 0.28
            sl[i] += sig * 0.9
            sr_arr[i] += sig * 1.1
    w = create_wav_writer(os.path.join(output_dir, "sfx_00_opener.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # -------------------------------------------------------------
    # 1. Morning Village Walk (Scene 1)
    # Footsteps + chirping songbird
    # -------------------------------------------------------------
    dur = 3.0
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    # Footsteps at 0.2, 0.7, 1.2, 1.7, 2.2
    for step in [0.2, 0.7, 1.2, 1.7, 2.2]:
        for i in range(int(step*sr), min(n, int((step+0.15)*sr))):
            dt = (i - step*sr)/sr
            thud = math.sin(2*math.pi*90*dt) * math.exp(-dt * 30.0) * 0.22
            sl[i] += thud
            sr_arr[i] += thud
    # Bird chirps at 0.5 and 1.8
    for chirp in [0.5, 1.8]:
        for i in range(int(chirp*sr), min(n, int((chirp+0.35)*sr))):
            dt = (i - chirp*sr)/sr
            # FM bird tweet
            mod = math.sin(2*math.pi*28*dt) * 600
            carrier = math.sin(2*math.pi*(3200 + mod)*dt) * math.exp(-dt * 12.0) * 0.18
            sl[i] += carrier * 0.7
            sr_arr[i] += carrier * 1.2
    w = create_wav_writer(os.path.join(output_dir, "sfx_01_morning_walk.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # -------------------------------------------------------------
    # 2. Barber Scissors & Shop Bell (Scene 2)
    # -------------------------------------------------------------
    dur = 2.2
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    # Snips at 0.1, 0.45, 0.8
    for sn in [0.1, 0.45, 0.8]:
        for i in range(int(sn*sr), min(n, int((sn+0.12)*sr))):
            dt = (i - sn*sr)/sr
            metal = (math.sin(2*math.pi*3400*dt) + 0.5*math.sin(2*math.pi*5100*dt)) * math.exp(-dt*65)
            click = rng.uniform(-1, 1) * math.exp(-dt*95)
            val = (metal * 0.4 + click * 0.6) * 0.35
            sl[i] += val
            sr_arr[i] += val
    # Shop door bell ding at 1.2
    for i in range(int(1.2*sr), n):
        dt = (i - 1.2*sr)/sr
        bell = (math.sin(2*math.pi*2200*dt) + 0.4*math.sin(2*math.pi*4400*dt)) * math.exp(-dt*4.0) * 0.25
        sl[i] += bell * 1.1
        sr_arr[i] += bell * 0.9
    w = create_wav_writer(os.path.join(output_dir, "sfx_02_scissors.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # -------------------------------------------------------------
    # 3. Kitchen Cooking Pots & Bubbles (Scene 3)
    # -------------------------------------------------------------
    dur = 2.5
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    # Liquid bubbles
    for _ in range(12):
        bt = rng.uniform(0.1, 2.2)
        bf = rng.uniform(350, 650)
        for i in range(int(bt*sr), min(n, int((bt+0.08)*sr))):
            dt = (i - bt*sr)/sr
            bubble = math.sin(2*math.pi*(bf + dt*1500)*dt) * math.sin(math.pi * dt / 0.08) * 0.18
            sl[i] += bubble * rng.uniform(0.8, 1.2)
            sr_arr[i] += bubble * rng.uniform(0.8, 1.2)
    # Pot lid clack at 0.6 and 1.7
    for cl in [0.6, 1.7]:
        for i in range(int(cl*sr), min(n, int((cl+0.1)*sr))):
            dt = (i - cl*sr)/sr
            metal = (math.sin(2*math.pi*1800*dt) + math.sin(2*math.pi*2700*dt)) * math.exp(-dt*45) * 0.20
            sl[i] += metal
            sr_arr[i] += metal
    w = create_wav_writer(os.path.join(output_dir, "sfx_03_kitchen.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # -------------------------------------------------------------
    # 4. Tailor Cloth & Tape Measure (Scene 4)
    # -------------------------------------------------------------
    dur = 2.0
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    # Tape measure zip at 0.2
    for i in range(int(0.2*sr), int(0.7*sr)):
        dt = (i - 0.2*sr)/sr
        zip_noise = (rng.uniform(-1, 1)) * (0.5 + 0.5*math.sin(2*math.pi*180*dt)) * 0.15
        sl[i] += zip_noise
        sr_arr[i] += zip_noise
    # Fabric swish cut at 1.0
    for i in range(int(1.0*sr), int(1.4*sr)):
        dt = (i - 1.0*sr)/sr
        swish = rng.uniform(-1, 1) * math.sin(math.pi * dt / 0.4) * 0.16
        sl[i] += swish
        sr_arr[i] += swish
    w = create_wav_writer(os.path.join(output_dir, "sfx_04_tailor.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # -------------------------------------------------------------
    # 5. Carpenter Sawing Wood (Scene 5)
    # -------------------------------------------------------------
    dur = 2.5
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    # Saw strokes: push & pull
    strokes = [(0.2, 0.6), (0.7, 1.1), (1.2, 1.6), (1.7, 2.1)]
    for idx, (st, en) in enumerate(strokes):
        pitch = 380 if idx % 2 == 0 else 440
        for i in range(int(st*sr), int(en*sr)):
            dt = (i - st*sr)/sr
            tooth = math.sin(2*math.pi*pitch*dt) * (rng.uniform(0.6, 1.0)) * 0.18
            sl[i] += tooth * 0.9
            sr_arr[i] += tooth * 1.1
    w = create_wav_writer(os.path.join(output_dir, "sfx_05_carpenter.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # -------------------------------------------------------------
    # 6. Forest Wind & Rustling Leaves (Scene 6)
    # -------------------------------------------------------------
    dur = 3.5
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    for i in range(n):
        t = i / sr
        # Wind swell
        wind_env = 0.5 + 0.5 * math.sin(2*math.pi*0.35*t)
        wind = (math.sin(2*math.pi*180*t) + 0.5*math.sin(2*math.pi*240*t)) * wind_env * 0.08
        leaves = rng.uniform(-1, 1) * wind_env * 0.04
        sl[i] = wind + leaves * 0.8
        sr_arr[i] = wind + leaves * 1.2
    w = create_wav_writer(os.path.join(output_dir, "sfx_06_forest_leaves.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # -------------------------------------------------------------
    # 7. Cave Echo & Water Drips (Scene 7)
    # -------------------------------------------------------------
    dur = 3.0
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    drips = [0.2, 0.9, 1.6, 2.3]
    for d in drips:
        for i in range(int(d*sr), min(n, int((d+0.12)*sr))):
            dt = (i - d*sr)/sr
            drop = math.sin(2*math.pi*(1400 - dt*4000)*dt) * math.exp(-dt*35) * 0.28
            sl[i] += drop
            sr_arr[i] += drop * 0.8
        # Echo
        echo_t = d + 0.16
        for i in range(int(echo_t*sr), min(n, int((echo_t+0.12)*sr))):
            dt = (i - echo_t*sr)/sr
            echo = math.sin(2*math.pi*(1400 - dt*4000)*dt) * math.exp(-dt*35) * 0.12
            sl[i] += echo * 0.6
            sr_arr[i] += echo
    w = create_wav_writer(os.path.join(output_dir, "sfx_07_cave_rain.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # -------------------------------------------------------------
    # 8. Tiger Roar & Thunder Strike (Scene 8)
    # -------------------------------------------------------------
    dur = 3.2
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    # Thunder strike at 0.1
    for i in range(int(0.1*sr), min(n, int(1.2*sr))):
        dt = (i - 0.1*sr)/sr
        crack = rng.uniform(-1, 1) * math.exp(-dt * 14.0) * 0.45
        sub = math.sin(2*math.pi*55*dt) * math.exp(-dt * 4.0) * 0.40
        sl[i] += crack + sub
        sr_arr[i] += crack + sub
    # Tiger roar at 0.6
    for i in range(int(0.6*sr), min(n, int(2.8*sr))):
        dt = (i - 0.6*sr)/sr
        roar_env = math.sin(math.pi * dt / 2.2) if dt < 2.2 else 0
        mod = math.sin(2*math.pi*45*dt) * 50
        # Guttural growl
        growl = (math.sin(2*math.pi*(110 + mod)*dt) + 0.6*math.sin(2*math.pi*(165 + mod)*dt)) * roar_env * 0.38
        noise = rng.uniform(-1, 1) * roar_env * 0.18
        sl[i] += (growl + noise) * 1.1
        sr_arr[i] += (growl + noise) * 0.9
    w = create_wav_writer(os.path.join(output_dir, "sfx_08_tiger_thunder.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # -------------------------------------------------------------
    # 9. Cartoon Hair Pop / Boing (Scene 9)
    # -------------------------------------------------------------
    dur = 1.8
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    # Cork POP at 0.2
    for i in range(int(0.2*sr), min(n, int(0.35*sr))):
        dt = (i - 0.2*sr)/sr
        pop = math.sin(2*math.pi*(300 + dt*2200)*dt) * math.exp(-dt * 45.0) * 0.55
        sl[i] += pop
        sr_arr[i] += pop
    # Spring BOING at 0.3
    for i in range(int(0.3*sr), min(n, int(1.5*sr))):
        dt = (i - 0.3*sr)/sr
        boing_f = 240 + math.sin(2*math.pi*16*dt) * 120
        boing = math.sin(2*math.pi*boing_f*dt) * math.exp(-dt * 3.5) * 0.38
        sl[i] += boing
        sr_arr[i] += boing
    w = create_wav_writer(os.path.join(output_dir, "sfx_09_hair_pop.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # -------------------------------------------------------------
    # 10. Fast Cartoon Running Whoosh (Scene 10)
    # -------------------------------------------------------------
    dur = 2.4
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    # Rapid cartoon tip-tap steps at 0.1s intervals
    for step_idx in range(16):
        st = 0.2 + step_idx * 0.12
        for i in range(int(st*sr), min(n, int((st+0.06)*sr))):
            dt = (i - st*sr)/sr
            tap = math.sin(2*math.pi*480*dt) * math.exp(-dt * 70.0) * 0.26
            sl[i] += tap * (1.1 if step_idx % 2 == 0 else 0.8)
            sr_arr[i] += tap * (0.8 if step_idx % 2 == 0 else 1.1)
    # Fast wind whoosh
    for i in range(int(0.4*sr), min(n, int(1.8*sr))):
        dt = (i - 0.4*sr)/sr
        whoosh = rng.uniform(-1, 1) * math.sin(math.pi * dt / 1.4) * 0.12
        sl[i] += whoosh
        sr_arr[i] += whoosh
    w = create_wav_writer(os.path.join(output_dir, "sfx_10_running.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # -------------------------------------------------------------
    # 11. Bald Head Sparkling Shine "PING!" (Scene 11)
    # -------------------------------------------------------------
    dur = 2.0
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    # High crystal ding at 0.2s
    for i in range(int(0.2*sr), n):
        dt = (i - 0.2*sr)/sr
        ping = (math.sin(2*math.pi*2637*dt) + 0.4*math.sin(2*math.pi*5274*dt)) * math.exp(-dt * 3.8) * 0.35
        # Shimmer sparkle
        shimmer = math.sin(2*math.pi*3951*dt) * math.sin(2*math.pi*18*dt) * math.exp(-dt * 4.0) * 0.18
        sl[i] += ping + shimmer
        sr_arr[i] += ping - shimmer
    w = create_wav_writer(os.path.join(output_dir, "sfx_11_head_shine.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # -------------------------------------------------------------
    # 12. Moral Scene Celestial Harp Sparkle (Scene 12)
    # -------------------------------------------------------------
    dur = 2.8
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    # Harp arpeggio: C5, E5, G5, B5, C6, E6
    harp_notes = [523.25, 659.25, 783.99, 987.77, 1046.50, 1318.51]
    for idx, f in enumerate(harp_notes):
        st = idx * 0.14
        for i in range(int(st*sr), n):
            dt = (i - st*sr)/sr
            env = math.exp(-dt * 2.8)
            sig = (math.sin(2*math.pi*f*dt) + 0.25*math.sin(4*math.pi*f*dt)) * env * 0.20
            pan_l = 1.0 - (idx / len(harp_notes)) * 0.5
            pan_r = 0.5 + (idx / len(harp_notes)) * 0.5
            sl[i] += sig * pan_l
            sr_arr[i] += sig * pan_r
    w = create_wav_writer(os.path.join(output_dir, "sfx_12_moral_sparkle.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # -------------------------------------------------------------
    # 13. Outro Celebratory Chime & Pop (Scene 13)
    # -------------------------------------------------------------
    dur = 2.2
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    # Double bell ding: G5 then C6
    for idx, f in enumerate([1567.98, 2093.00]):
        st = idx * 0.22
        for i in range(int(st*sr), n):
            dt = (i - st*sr)/sr
            bell = (math.sin(2*math.pi*f*dt) + 0.35*math.sin(4*math.pi*f*dt)) * math.exp(-dt * 3.5) * 0.28
            sl[i] += bell
            sr_arr[i] += bell
    w = create_wav_writer(os.path.join(output_dir, "sfx_13_outro_pop.wav"))
    write_stereo_frames(w, sl, sr_arr)

    print(f"✔ Generated 14 rich tactile sound effects in {output_dir}")

def generate_bgm_track(output_path):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    sr = 44100
    bpm = 96
    beat_dur = 60.0 / bpm # ~0.625s
    bar_dur = beat_dur * 4 # ~2.5s
    num_bars = 16 # 40 seconds loop
    total_dur = num_bars * bar_dur
    total_samples = int(sr * total_dur)

    # Chords: C - G - Am - F
    chords = [
        (130.81, [261.63, 329.63, 392.00, 523.25]), # C
        (98.00,  [196.00, 246.94, 293.66, 392.00]), # G
        (110.00, [220.00, 261.63, 329.63, 440.00]), # Am
        (87.31,  [174.61, 220.00, 261.63, 349.23]), # F
    ]

    melody_pattern = [
        (0.0, 659.25), (0.5, 783.99), (1.0, 1046.50), (2.0, 880.00), (3.0, 783.99),
        (4.0, 587.33), (5.0, 659.25), (6.0, 783.99), (7.0, 659.25),
        (8.0, 880.00), (9.0, 1046.50), (10.0, 880.00), (11.0, 783.99),
        (12.0, 659.25), (13.0, 587.33), (14.0, 523.25),
        (16.0, 659.25), (17.0, 783.99), (18.0, 1046.50), (19.0, 1174.66), (20.0, 1318.51),
        (22.0, 1046.50), (24.0, 880.00), (26.0, 783.99), (28.0, 659.25), (30.0, 523.25)
    ]

    w = create_wav_writer(output_path, sample_rate=sr, channels=2)
    sl = [0.0] * total_samples
    sr_arr = [0.0] * total_samples
    rng = random.Random(999)

    for i in range(total_samples):
        t = i / sr
        bar_idx = int(t / bar_dur)
        chord_bass, chord_triad = chords[bar_idx % 4]
        bar_t = t % bar_dur
        beat_idx = int(bar_t / beat_dur)
        beat_t = bar_t % beat_dur

        sig = 0.0

        # 1. Warm Pizzicato Bass (Beat 1 & 3)
        if beat_idx in [0, 2]:
            b_dt = beat_t if beat_idx == 0 else bar_t - (beat_dur * 2)
            bass_env = math.exp(-b_dt * 2.8)
            sig += (math.sin(2*math.pi*chord_bass*b_dt) + 0.3*math.sin(4*math.pi*chord_bass*b_dt)) * bass_env * 0.32

        # 2. Gentle Marimba Arpeggio (on every beat)
        arp_note = chord_triad[beat_idx % len(chord_triad)]
        marimba_env = math.exp(-beat_t * 5.5)
        sig += (math.sin(2*math.pi*arp_note*beat_t) + 0.22*math.sin(4*math.pi*arp_note*beat_t)) * marimba_env * 0.20

        # 3. Glockenspiel Counter-Melody
        for mel_beat, mel_freq in melody_pattern:
            mel_time = mel_beat * beat_dur
            if t >= mel_time and t < mel_time + 1.8:
                m_dt = t - mel_time
                glock_env = math.exp(-m_dt * 3.2)
                sig += (math.sin(2*math.pi*mel_freq*m_dt) + 0.3*math.sin(4*math.pi*mel_freq*m_dt)) * glock_env * 0.16

        # 4. Subtle Shaker Texture
        shaker_t = (t % (beat_dur / 2))
        shaker_env = math.exp(-shaker_t * 22.0)
        sig += rng.uniform(-1, 1) * shaker_env * 0.035

        # Pan
        sl[i] = sig * 0.95
        sr_arr[i] = sig * 1.05

    write_stereo_frames(w, sl, sr_arr)
    print(f"✔ Generated seamless 40s BGM soundtrack loop in {output_path}")

if __name__ == "__main__":
    story_dir = "stories/hari-cukur-rambut"
    sfx_dir = os.path.join(story_dir, "assets/sfx")
    audio_dir = os.path.join(story_dir, "assets/audio")
    
    generate_sfx_suite(sfx_dir)
    bgm_path = os.path.join(audio_dir, "bgm_whimsical_story.wav")
    generate_bgm_track(bgm_path)
