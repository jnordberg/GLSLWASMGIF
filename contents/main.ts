
const GIF = window['GIF']
const GlslEditor = window['GlslEditor']

import {EventEmitter} from 'events'

window.addEventListener('DOMContentLoaded', main)

function nextTick(): Promise<void> {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, 0)
    })
}

const shader = `// Shader based on glslsandbox.com/e#39393.0
// Go to glslsandbox.com for more inspiration!

#ifdef GL_ES
precision mediump float;
#endif

uniform float time;
uniform vec2 resolution;

void main(void) {
    vec4 f = vec4(0.0);
    vec2 g = gl_FragCoord.xy;

    g -= f.xy = resolution.xy / 2.0;
    g /= f.y;

    float d = pow(abs(.6 - max(abs(g.x),abs(g.y))), .1);

    g += d;
    g *= g;

    f = vec4(g,d,1) * d * (1.320 + 2. * sin(50.*d+time*4.));

    gl_FragColor = f;
}

`

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
const canWasm = window['WebAssembly'] != null

if (isMobile) {
    alert('This is probably not going to work on your phone, check it out on yor desktop computer.')
}

class Control extends EventEmitter {

    inputEl: HTMLInputElement|HTMLSelectElement
    valueEl?: HTMLSpanElement
    valueStuffix?: string
    valueFormatter?: (value: string) => string

    constructor(readonly el: HTMLElement) {
        super()
        this.inputEl = el.querySelector('input') || el.querySelector('select')
        this.inputEl.addEventListener('change', this.changeHandler)
        this.valueEl = el.querySelector('.value') as HTMLSpanElement
        this.valueStuffix = el.dataset['stuffix']
    }

    changeHandler = (event) => {
        this.emit('change', this)
        if (this.valueEl) {
            this.valueEl.innerText = this.formatValue(this.value)
        }
    }

    get name() {
        return this.inputEl.getAttribute('id')
    }

    get value() {
        return this.inputEl.value
    }

    get numericValue() {
        return Number.parseFloat(this.value)
    }

    set value(value: any) {
        this.inputEl.value = String(value)
        if (this.valueEl) {
            this.valueEl.innerText = this.formatValue(value)
        }
    }

    formatValue(value: any) {
        let rv = String(value)
        if (this.valueFormatter) {
            rv = this.valueFormatter(rv)
        }
        if (this.valueStuffix) {
            rv += this.valueStuffix
        }
        return rv
    }
}

function main() {
    const editor = new GlslEditor('#editor', {
        canvas_width: 250,
        canvas_height: 250,
        canvas_resizable: true,
        canvas_draggable: true,
        theme: 'monokai',
        frag: shader,
    })

    let controls: {[name: string]: Control} = {}
    for (const el of Array.from(document.querySelectorAll('.controls .control'))) {
        const control = new Control(el as HTMLElement)
        controls[control.name] = control
    }

    controls['render-repeat'].valueFormatter = (value) => {
        if (value === '0') { return 'no repeat' }
        if (value === '21') { return 'forever' }
        return value
    }

    controls['render-quality'].valueFormatter = (value) => {
        return String(31 - Number.parseInt(value))
    }

    const canvas = editor.shader.canvas
    const canvasEl: HTMLCanvasElement = editor.shader.el_canvas

    function getCaptureInfo() {
        const duration = controls['capture-duration'].numericValue * 1000
        const interval = controls['capture-interval'].numericValue
        const numFrames = Math.ceil(duration / interval)
        return {duration, interval, numFrames}
    }

    const _canvasResize = canvas.resize
    canvas.resize = function() {
        if (!canvas.paused && _canvasResize.call(canvas)) {
            updateCanvasSize()
        }
    }
    function updateCanvasSize() {
        const scale = controls['capture-scale'].numericValue
        controls['capture-size'].value = `${ ~~(canvasEl.width * scale) }x${ ~~(canvasEl.height * scale) }`
    }
    updateCanvasSize()
    controls['capture-scale'].on('change', updateCanvasSize)

    setTimeout(() => {
        canvasEl.parentElement.style.top = '28px'
        canvasEl.parentElement.style.left = `${ window.innerWidth - 250 - 28 }px`
    }, 2000)

    function updateCaptureFrames() {
        const {numFrames} = getCaptureInfo()
        controls['capture-frames'].value = numFrames
    }
    updateCaptureFrames()
    controls['capture-duration'].on('change', updateCaptureFrames)
    controls['capture-interval'].on('change', updateCaptureFrames)

    const captureButton = document.querySelector('button[name=capture]') as HTMLButtonElement
    const renderButton = document.querySelector('button[name=render]') as HTMLButtonElement

    const captureInfo = document.querySelector('#capture .controls .info') as HTMLParagraphElement
    const renderInfo = document.querySelector('#render .controls .info') as HTMLParagraphElement

    renderButton.disabled = true

    let frames: ImageData[]
    let frameSize: {width: number, height: number}

    async function captureFrames() {
        captureButton.disabled = true
        renderButton.disabled = true
        canvas.pause()

        const start = performance.now()

        canvasEl.style.visibility = 'hidden'

        const prevW = canvasEl.width
        const prevH = canvasEl.height

        const scale = controls['capture-scale'].numericValue
        const gl = canvas.gl as WebGLRenderingContext
        const w = ~~(gl.drawingBufferWidth * scale)
        const h = ~~(gl.drawingBufferHeight * scale)

        gl.viewport(0, 0, w, h)
        canvasEl.width = w
        canvasEl.height = h
        canvas.uniform('2f', 'vec2', 'resolution', w, h)

        const tmpc = document.createElement('canvas')
        tmpc.width = w
        tmpc.height = h
        const tctx = tmpc.getContext('2d')

        frames = []
        frameSize = {width: w, height: h}

        const {interval, numFrames} = getCaptureInfo()
        for (var i = 0; i < numFrames; i++) {
            captureInfo.innerText = `Capturing frame ${ i+1 }/${ numFrames }`
            canvas.uniform('1f', 'float', 'time', (i+1) * interval / 1000)
            gl.drawArrays(gl.TRIANGLES, 0, 6)

            // this is faster but the y-axis gets flipped
            // let data = new ImageData(w, h)
            // let pixels = new Uint8Array(data.data.buffer)
            // gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

            tctx.clearRect(0, 0, w, h)
            tctx.drawImage(canvasEl, 0, 0)
            const data = tctx.getImageData(0, 0, w, h)
            frames.push(data)

            // don't lock up the ui
            if (i % 4 == 0) {
                await nextTick()
            }
        }

        canvasEl.width = prevW
        canvasEl.height = prevH
        gl.viewport(0, 0, prevW, prevH)

        canvasEl.style.visibility = 'visible'

        captureButton.disabled = false
        renderButton.disabled = false
        canvas.play()

        const dt = (performance.now() - start) / 1000
        captureInfo.innerText = `Captured ${ numFrames } frames in ${ dt.toFixed(2) }s`
        renderInfo.innerText = `Ready to render`
    }

    const resultImage = document.querySelector('#result img') as HTMLImageElement
    const resultInfo = document.querySelector('#result .info') as HTMLParagraphElement

    if (!canWasm) {
        controls['render-backend'].value = 'js'
    }

    function renderFrames() {
        captureButton.disabled = true
        renderButton.disabled = true

        renderInfo.innerText = `Starting render`
        const start = performance.now()


        const useWasm = controls['render-backend'].value == 'wasm'
        const dither = controls['render-dither'].value

        let repeat = controls['render-repeat'].numericValue
        if (repeat === 0) { repeat = -1 }
        if (repeat === 21) { repeat = 0 }

        const quality = 31 - controls['render-quality'].numericValue

        if (useWasm && !canWasm) {
            renderInfo.innerText = 'Your browser does not support WebAssembly'
            return
        }

        const gif = new GIF({
            workerScript: useWasm ? 'gif.worker-wasm.js' : 'gif.worker.js',
            workers: controls['render-workers'].numericValue,
            quality,
            width: frameSize.width,
            height: frameSize.height,
            dither: dither === 'None' ? false : dither,
            repeat,
        })

        const delay = controls['render-delay'].numericValue
        for (const frame of frames) {
            gif.addFrame(frame, {delay})
        }

        gif.on('progress', (p) => {
            renderInfo.innerText = `Rendering ${ (p*100).toFixed(0) }%`
        })

        gif.on('finished', (result: Blob) => {
            const dt = (performance.now() - start) / 1000
            resultImage.src = URL.createObjectURL(result)
            renderInfo.innerText = `Rendering done in ${ dt.toFixed(2) }s`
            captureButton.disabled = false
            renderButton.disabled = false
            resultInfo.innerText = `
                Image size: ${ (result.size / 1000).toFixed(2) }kb
            `
        })
        gif.render()
    }

    captureButton.addEventListener('click', (event) => {
        event.preventDefault()
        captureFrames()
    })

    renderButton.addEventListener('click', (event) => {
        event.preventDefault()
        renderFrames()
    })
}
