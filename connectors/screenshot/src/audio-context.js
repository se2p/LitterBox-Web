// SPDX-FileCopyrightText: 2025 LitterBox-Web contributors
//
// SPDX-License-Identifier: EUPL-1.2

// --- Minimal WebAudio stub (no real audio output) ---
class FakeAudioContext {
    constructor() {
        this.destination = {};
        this.sampleRate = 44100;
        this.state = "running";
        this.currentTime = 0;
    }
    resume() {
        return Promise.resolve();
    }
    close() {
        return Promise.resolve();
    }
    createGain() {
        return { gain: { value: 1 }, connect() {}, disconnect() {} };
    }
    createOscillator() {
        return {
            frequency: { value: 440 },
            connect() {},
            disconnect() {},
            start() {},
            stop() {},
        };
    }
    createBufferSource() {
        return {
            buffer: null,
            connect() {},
            disconnect() {},
            start() {},
            stop() {},
        };
    }
    decodeAudioData() {
        return Promise.resolve({});
    }
}

module.exports = FakeAudioContext;
