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

def generate_raja_gemuk_sfx_suite(output_dir):
    os.makedirs(output_dir, exist_ok=True)
    sr = 44100
    rng = random.Random(42)

    # 0. Cover Opener (Royal Harp & Chimes)
    dur = 2.5
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    notes = [523.25, 659.25, 783.99, 1046.50, 1318.51] # C5, E5, G5, C6, E6
    for idx, f in enumerate(notes):
        st = idx * 0.16
        for i in range(int(st * sr), n):
            dt = (i - st * sr) / sr
            env = math.exp(-dt * 3.5)
            sig = (math.sin(2*math.pi*f*dt) + 0.3*math.sin(4*math.pi*f*dt)) * env * 0.3
            sl[i] += sig * 0.9
            sr_arr[i] += sig * 1.1
    w = create_wav_writer(os.path.join(output_dir, "sfx_00_opener.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # 1. Throne Room Fanfare (Scene 01)
    dur = 2.8
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    fanfare = [(0.0, 392.0), (0.22, 523.25), (0.45, 659.25), (0.75, 783.99)] # G4, C5, E5, G5
    for st, f in fanfare:
        for i in range(int(st*sr), n):
            dt = (i - st*sr)/sr
            env = math.exp(-dt * 2.8)
            # Brass harmonic structure
            sig = (math.sin(2*math.pi*f*dt) + 0.5*math.sin(4*math.pi*f*dt) + 0.25*math.sin(6*math.pi*f*dt)) * env * 0.32
            sl[i] += sig * 0.95
            sr_arr[i] += sig * 1.05
    w = create_wav_writer(os.path.join(output_dir, "sfx_01_throne.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # 2. Dog Intro & Collar Jingle (Scene 02)
    dur = 2.5
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    # Collar jingles (high sparkling resonant pings)
    for j_time in [0.2, 0.5, 0.8, 1.1, 1.4]:
        jf = rng.choice([2637.0, 3135.9, 3520.0])
        for i in range(int(j_time*sr), min(n, int((j_time+0.3)*sr))):
            dt = (i - j_time*sr)/sr
            env = math.exp(-dt * 18.0)
            sig = math.sin(2*math.pi*jf*dt) * env * 0.22
            sl[i] += sig * 0.85
            sr_arr[i] += sig * 1.15
    w = create_wav_writer(os.path.join(output_dir, "sfx_02_dog.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # 3. Garden Walk Footsteps (Scene 03)
    dur = 3.0
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    for step in [0.2, 0.75, 1.3, 1.85, 2.4]:
        for i in range(int(step*sr), min(n, int((step+0.12)*sr))):
            dt = (i - step*sr)/sr
            env = math.exp(-dt * 30.0)
            sig = (math.sin(2*math.pi*110*dt) + rng.uniform(-0.5, 0.5)) * env * 0.26
            sl[i] += sig
            sr_arr[i] += sig
    w = create_wav_writer(os.path.join(output_dir, "sfx_03_walk.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # 4. Cheerful Bird Chirp (Scene 04)
    dur = 2.2
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    for t_chirp in [0.15, 0.5, 0.85, 1.3]:
        for i in range(int(t_chirp*sr), min(n, int((t_chirp+0.16)*sr))):
            dt = (i - t_chirp*sr)/sr
            env = math.sin(math.pi * (dt / 0.16))
            f_inst = 2200 + 1200 * math.sin(2*math.pi*8*dt)
            sig = math.sin(2*math.pi*f_inst*dt) * env * 0.28
            sl[i] += sig * 0.9
            sr_arr[i] += sig * 1.1
    w = create_wav_writer(os.path.join(output_dir, "sfx_04_bird.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # 5. Playful Bark & Dash Whoosh (Scene 05)
    dur = 2.4
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    # Two quick dog barks
    for b_time in [0.1, 0.38]:
        for i in range(int(b_time*sr), min(n, int((b_time+0.18)*sr))):
            dt = (i - b_time*sr)/sr
            env = math.exp(-dt * 20.0)
            f_bark = 450 - 150 * (dt / 0.18)
            sig = (math.sin(2*math.pi*f_bark*dt) + 0.3*rng.uniform(-1, 1)) * env * 0.38
            sl[i] += sig
            sr_arr[i] += sig
    # Dash whoosh at 0.7
    for i in range(int(0.7*sr), min(n, int(1.3*sr))):
        dt = (i - 0.7*sr)/sr
        env = math.sin(math.pi * (dt / 0.6))
        sig = rng.uniform(-1, 1) * env * 0.32
        sl[i] += sig * (1.0 - dt/0.6)
        sr_arr[i] += sig * (dt / 0.6)
    w = create_wav_writer(os.path.join(output_dir, "sfx_05_dog_dash.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # 6. King Heavy Running & Panting (Scene 06)
    dur = 3.2
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    # Heavy cartoon footfalls
    for h_step in [0.15, 0.65, 1.15, 1.65, 2.15, 2.65]:
        for i in range(int(h_step*sr), min(n, int((h_step+0.2)*sr))):
            dt = (i - h_step*sr)/sr
            env = math.exp(-dt * 22.0)
            sig = (math.sin(2*math.pi*85*dt) + 0.4*rng.uniform(-1, 1)) * env * 0.42
            sl[i] += sig
            sr_arr[i] += sig
    w = create_wav_writer(os.path.join(output_dir, "sfx_06_king_pant.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # 7. Comical Cartoon Chase (Scene 07)
    dur = 3.5
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    # Rapid comedic patter footsteps
    for p_step in [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0, 1.15, 1.3, 1.45, 1.6, 1.75, 1.9, 2.05, 2.2, 2.35, 2.5]:
        for i in range(int(p_step*sr), min(n, int((p_step+0.08)*sr))):
            dt = (i - p_step*sr)/sr
            env = math.exp(-dt * 45.0)
            sig = (math.sin(2*math.pi*150*dt) + 0.3*rng.uniform(-1, 1)) * env * 0.35
            sl[i] += sig * (0.8 if p_step % 0.2 == 0 else 1.2)
            sr_arr[i] += sig * (1.2 if p_step % 0.2 == 0 else 0.8)
    w = create_wav_writer(os.path.join(output_dir, "sfx_07_chase_loop.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # 8. Joyful Hug & Catch Fanfare (Scene 08)
    dur = 2.6
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    hug_notes = [523.25, 659.25, 783.99, 1046.50]
    for idx, f in enumerate(hug_notes):
        st = idx * 0.15
        for i in range(int(st*sr), n):
            dt = (i - st*sr)/sr
            env = math.exp(-dt * 3.6)
            sig = (math.sin(2*math.pi*f*dt) + 0.25*math.sin(3*math.pi*f*dt)) * env * 0.28
            sl[i] += sig
            sr_arr[i] += sig
    w = create_wav_writer(os.path.join(output_dir, "sfx_08_catch_cheer.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # 9. Mirror Sparkle & Trim Triumph (Scene 09)
    dur = 2.8
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    for t_spk in [0.1, 0.3, 0.5, 0.7, 0.9, 1.2]:
        sf = rng.choice([2093.0, 2637.0, 3135.9, 4186.0])
        for i in range(int(t_spk*sr), min(n, int((t_spk+0.35)*sr))):
            dt = (i - t_spk*sr)/sr
            env = math.exp(-dt * 14.0)
            sig = math.sin(2*math.pi*sf*dt) * env * 0.24
            sl[i] += sig * 0.85
            sr_arr[i] += sig * 1.15
    w = create_wav_writer(os.path.join(output_dir, "sfx_09_mirror_sparkle.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # 10. Moral Stardust Harp (Scene 10)
    dur = 3.0
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    moral_notes = [440.0, 554.37, 659.25, 880.0, 1108.73, 1318.51]
    for idx, f in enumerate(moral_notes):
        st = idx * 0.14
        for i in range(int(st*sr), n):
            dt = (i - st*sr)/sr
            env = math.exp(-dt * 3.2)
            sig = math.sin(2*math.pi*f*dt) * env * 0.26
            sl[i] += sig * 0.9
            sr_arr[i] += sig * 1.1
    w = create_wav_writer(os.path.join(output_dir, "sfx_10_moral_harp.wav"))
    write_stereo_frames(w, sl, sr_arr)

    # 11. Outro Fanfare Pop (Scene 11)
    dur = 2.5
    n = int(sr * dur)
    sl, sr_arr = [0.0]*n, [0.0]*n
    for idx, f in enumerate([659.25, 783.99, 1046.50, 1318.51]):
        st = idx * 0.12
        for i in range(int(st*sr), n):
            dt = (i - st*sr)/sr
            env = math.exp(-dt * 3.5)
            sig = (math.sin(2*math.pi*f*dt) + 0.25*math.sin(4*math.pi*f*dt)) * env * 0.28
            sl[i] += sig * 0.95
            sr_arr[i] += sig * 1.05
    w = create_wav_writer(os.path.join(output_dir, "sfx_11_outro_pop.wav"))
    write_stereo_frames(w, sl, sr_arr)

    print("✔ All 12 WAV sound effects generated in", output_dir)

    # Convert all wav to AAC .m4a
    for fname in os.listdir(output_dir):
        if fname.endswith(".wav"):
            base = os.path.splitext(fname)[0]
            wav_path = os.path.join(output_dir, fname)
            m4a_path = os.path.join(output_dir, f"{base}.m4a")
            cmd = ["afconvert", "-f", "mp4f", "-d", "aac", "-b", "128000", wav_path, m4a_path]
            subprocess.run(cmd, check=True)
            os.remove(wav_path)
            print(f"  ✔ Compressed: {base}.m4a")

if __name__ == "__main__":
    sfx_dir = "stories/raja-gemuk-anjing-kurus/assets/sfx"
    generate_raja_gemuk_sfx_suite(sfx_dir)
