// Stable-fluids solver on WebGL2 half-float targets. The pass structure (curl,
// vorticity confinement, divergence, Jacobi pressure, gradient subtract,
// advection) follows Pavel Dobryakov's WebGL-Fluid-Simulation (MIT). The dye
// here is a single "reveal depth" channel rather than colour.

export const FULLSCREEN_VERTEX = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const HEADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform vec2 texelSize;
`;

const SPLAT = `${HEADER}
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform vec2 prevPoint;
uniform float radius;
uniform float saturate;

float segmentDistance(vec2 uv, vec2 a, vec2 b) {
  vec2 pa = uv - a;
  vec2 ba = b - a;
  pa.x *= aspectRatio;
  ba.x *= aspectRatio;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  float d = segmentDistance(vUv, prevPoint, point);
  vec3 splat = exp(-(d * d) / max(radius, 1e-6)) * color;
  vec3 base = texture(uTarget, vUv).xyz;
  // Screen-blend the reveal dye so repeated strokes saturate at 1 instead of
  // stacking into a flat plateau; velocity stays additive.
  vec3 blended = mix(base + splat, 1.0 - (1.0 - base) * (1.0 - clamp(splat, 0.0, 1.0)), saturate);
  outColor = vec4(blended, 1.0);
}`;

const CURL = `${HEADER}
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vUv - vec2(texelSize.x, 0.0)).y;
  float R = texture(uVelocity, vUv + vec2(texelSize.x, 0.0)).y;
  float T = texture(uVelocity, vUv + vec2(0.0, texelSize.y)).x;
  float B = texture(uVelocity, vUv - vec2(0.0, texelSize.y)).x;
  outColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

const VORTICITY = `${HEADER}
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main() {
  float L = texture(uCurl, vUv - vec2(texelSize.x, 0.0)).x;
  float R = texture(uCurl, vUv + vec2(texelSize.x, 0.0)).x;
  float T = texture(uCurl, vUv + vec2(0.0, texelSize.y)).x;
  float B = texture(uCurl, vUv - vec2(0.0, texelSize.y)).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 vel = texture(uVelocity, vUv).xy + force * dt;
  outColor = vec4(clamp(vel, -1000.0, 1000.0), 0.0, 1.0);
}`;

const DIVERGENCE = `${HEADER}
uniform sampler2D uVelocity;
void main() {
  vec2 C = texture(uVelocity, vUv).xy;
  float L = texture(uVelocity, vUv - vec2(texelSize.x, 0.0)).x;
  float R = texture(uVelocity, vUv + vec2(texelSize.x, 0.0)).x;
  float T = texture(uVelocity, vUv + vec2(0.0, texelSize.y)).y;
  float B = texture(uVelocity, vUv - vec2(0.0, texelSize.y)).y;
  if (vUv.x - texelSize.x < 0.0) { L = -C.x; }
  if (vUv.x + texelSize.x > 1.0) { R = -C.x; }
  if (vUv.y + texelSize.y > 1.0) { T = -C.y; }
  if (vUv.y - texelSize.y < 0.0) { B = -C.y; }
  outColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const SCALE = `${HEADER}
uniform sampler2D uTexture;
uniform float value;
void main() {
  outColor = value * texture(uTexture, vUv);
}`;

const PRESSURE = `${HEADER}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main() {
  float L = texture(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
  float T = texture(uPressure, vUv + vec2(0.0, texelSize.y)).x;
  float B = texture(uPressure, vUv - vec2(0.0, texelSize.y)).x;
  float divergence = texture(uDivergence, vUv).x;
  outColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT_SUBTRACT = `${HEADER}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main() {
  float L = texture(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
  float T = texture(uPressure, vUv + vec2(0.0, texelSize.y)).x;
  float B = texture(uPressure, vUv - vec2(0.0, texelSize.y)).x;
  vec2 velocity = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  outColor = vec4(velocity, 0.0, 1.0);
}`;

const ADVECTION = `${HEADER}
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform float dt;
uniform float dissipation;
void main() {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  outColor = dissipation * texture(uSource, coord);
  outColor.a = 1.0;
}`;

export type Program = {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
};

export function compileProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string): Program {
  const compile = (type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Could not create shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile failed: ${log ?? "unknown error"}`);
    }
    return shader;
  };

  const program = gl.createProgram();
  if (!program) throw new Error("Could not create program");
  const vs = compile(gl.VERTEX_SHADER, vertex);
  const fs = compile(gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(program) ?? "unknown error"}`);
  }

  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let index = 0; index < count; index++) {
    const info = gl.getActiveUniform(program, index);
    if (info) uniforms[info.name] = gl.getUniformLocation(program, info.name);
  }
  return { program, uniforms };
}

type Target = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
};

class DoubleTarget {
  read: Target;
  write: Target;

  constructor(read: Target, write: Target) {
    this.read = read;
    this.write = write;
  }

  swap(): void {
    const read = this.read;
    this.read = this.write;
    this.write = read;
  }
}

export type FluidConfig = {
  simScale: number;
  dyeScale: number;
  curl: number;
  velocityDissipation: number;
  dyeDissipation: number;
  pressureDissipation: number;
  pressureIterations: number;
};

const defaultConfig: FluidConfig = {
  simScale: 0.12,
  dyeScale: 0.35,
  curl: 8,
  velocityDissipation: 0.94,
  // Holds the reveal for roughly 0.7s after the cursor stops before the
  // blocks drop below the first depth threshold.
  dyeDissipation: 0.96,
  pressureDissipation: 0.8,
  pressureIterations: 12,
};

export class FluidSim {
  readonly config: FluidConfig;
  private readonly gl: WebGL2RenderingContext;
  private readonly vao: WebGLVertexArrayObject;
  private readonly programs: Record<"splat" | "curl" | "vorticity" | "divergence" | "scale" | "pressure" | "gradient" | "advection", Program>;
  private velocity!: DoubleTarget;
  private dye!: DoubleTarget;
  private pressure!: DoubleTarget;
  private divergence!: Target;
  private curl!: Target;
  private aspect = 1;

  constructor(gl: WebGL2RenderingContext, config: Partial<FluidConfig> = {}) {
    this.gl = gl;
    this.config = { ...defaultConfig, ...config };
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Could not create vertex array");
    this.vao = vao;
    this.programs = {
      splat: compileProgram(gl, FULLSCREEN_VERTEX, SPLAT),
      curl: compileProgram(gl, FULLSCREEN_VERTEX, CURL),
      vorticity: compileProgram(gl, FULLSCREEN_VERTEX, VORTICITY),
      divergence: compileProgram(gl, FULLSCREEN_VERTEX, DIVERGENCE),
      scale: compileProgram(gl, FULLSCREEN_VERTEX, SCALE),
      pressure: compileProgram(gl, FULLSCREEN_VERTEX, PRESSURE),
      gradient: compileProgram(gl, FULLSCREEN_VERTEX, GRADIENT_SUBTRACT),
      advection: compileProgram(gl, FULLSCREEN_VERTEX, ADVECTION),
    };
  }

  get velocityTexture(): WebGLTexture {
    return this.velocity.read.texture;
  }

  get dyeTexture(): WebGLTexture {
    return this.dye.read.texture;
  }

  /** Allocates targets for a CSS-pixel viewport; the sim runs at a fraction of it. */
  resize(cssWidth: number, cssHeight: number): void {
    this.disposeTargets();
    this.aspect = cssWidth / Math.max(cssHeight, 1);
    const size = (scale: number) => ({
      width: Math.max(16, Math.round(cssWidth * scale)),
      height: Math.max(16, Math.round(cssHeight * scale)),
    });
    const sim = size(this.config.simScale);
    const dye = size(this.config.dyeScale);
    const gl = this.gl;
    this.velocity = this.createDouble(sim.width, sim.height, gl.RG16F, gl.RG);
    this.dye = this.createDouble(dye.width, dye.height, gl.R16F, gl.RED);
    this.pressure = this.createDouble(sim.width, sim.height, gl.R16F, gl.RED);
    this.divergence = this.createTarget(sim.width, sim.height, gl.R16F, gl.RED);
    this.curl = this.createTarget(sim.width, sim.height, gl.R16F, gl.RED);
  }

  /**
   * Paints a stroke between two points in UV space (origin bottom-left).
   * `force` is the velocity to inject; `amount` is the reveal dye deposited.
   */
  splat(point: [number, number], prevPoint: [number, number], force: [number, number], amount: number, radius: number): void {
    const { gl } = this;
    const program = this.programs.splat;
    gl.useProgram(program.program);
    gl.uniform1f(program.uniforms.aspectRatio ?? null, this.aspect);
    gl.uniform2f(program.uniforms.point ?? null, point[0], point[1]);
    gl.uniform2f(program.uniforms.prevPoint ?? null, prevPoint[0], prevPoint[1]);

    gl.uniform1f(program.uniforms.radius ?? null, radius * radius);
    gl.uniform1f(program.uniforms.saturate ?? null, 0);
    gl.uniform3f(program.uniforms.color ?? null, force[0], force[1], 0);
    this.bindTexture(0, this.velocity.read.texture, program.uniforms.uTarget);
    this.draw(this.velocity.write);
    this.velocity.swap();

    if (amount > 0) {
      gl.useProgram(program.program);
      // The dye brush is wider than the force brush so the reveal halo trails
      // further than the swirl that carries it.
      gl.uniform1f(program.uniforms.radius ?? null, (radius * 1.25) ** 2);
      gl.uniform1f(program.uniforms.saturate ?? null, 1);
      gl.uniform3f(program.uniforms.color ?? null, amount, 0, 0);
      this.bindTexture(0, this.dye.read.texture, program.uniforms.uTarget);
      this.draw(this.dye.write);
      this.dye.swap();
    }
  }

  step(dt: number): void {
    const { gl, programs, config } = this;
    const simTexel: [number, number] = [1 / this.velocity.read.width, 1 / this.velocity.read.height];
    const frames = dt * 60;

    gl.useProgram(programs.curl.program);
    gl.uniform2f(programs.curl.uniforms.texelSize ?? null, ...simTexel);
    this.bindTexture(0, this.velocity.read.texture, programs.curl.uniforms.uVelocity);
    this.draw(this.curl);

    gl.useProgram(programs.vorticity.program);
    gl.uniform2f(programs.vorticity.uniforms.texelSize ?? null, ...simTexel);
    gl.uniform1f(programs.vorticity.uniforms.curl ?? null, config.curl);
    gl.uniform1f(programs.vorticity.uniforms.dt ?? null, dt);
    this.bindTexture(0, this.velocity.read.texture, programs.vorticity.uniforms.uVelocity);
    this.bindTexture(1, this.curl.texture, programs.vorticity.uniforms.uCurl);
    this.draw(this.velocity.write);
    this.velocity.swap();

    gl.useProgram(programs.divergence.program);
    gl.uniform2f(programs.divergence.uniforms.texelSize ?? null, ...simTexel);
    this.bindTexture(0, this.velocity.read.texture, programs.divergence.uniforms.uVelocity);
    this.draw(this.divergence);

    gl.useProgram(programs.scale.program);
    gl.uniform1f(programs.scale.uniforms.value ?? null, config.pressureDissipation ** frames);
    this.bindTexture(0, this.pressure.read.texture, programs.scale.uniforms.uTexture);
    this.draw(this.pressure.write);
    this.pressure.swap();

    gl.useProgram(programs.pressure.program);
    gl.uniform2f(programs.pressure.uniforms.texelSize ?? null, ...simTexel);
    this.bindTexture(1, this.divergence.texture, programs.pressure.uniforms.uDivergence);
    for (let iteration = 0; iteration < config.pressureIterations; iteration++) {
      this.bindTexture(0, this.pressure.read.texture, programs.pressure.uniforms.uPressure);
      this.draw(this.pressure.write);
      this.pressure.swap();
    }

    gl.useProgram(programs.gradient.program);
    gl.uniform2f(programs.gradient.uniforms.texelSize ?? null, ...simTexel);
    this.bindTexture(0, this.pressure.read.texture, programs.gradient.uniforms.uPressure);
    this.bindTexture(1, this.velocity.read.texture, programs.gradient.uniforms.uVelocity);
    this.draw(this.velocity.write);
    this.velocity.swap();

    gl.useProgram(programs.advection.program);
    gl.uniform2f(programs.advection.uniforms.texelSize ?? null, ...simTexel);
    gl.uniform1f(programs.advection.uniforms.dt ?? null, dt);
    gl.uniform1f(programs.advection.uniforms.dissipation ?? null, config.velocityDissipation ** frames);
    this.bindTexture(0, this.velocity.read.texture, programs.advection.uniforms.uVelocity);
    this.bindTexture(1, this.velocity.read.texture, programs.advection.uniforms.uSource);
    this.draw(this.velocity.write);
    this.velocity.swap();

    gl.uniform1f(programs.advection.uniforms.dissipation ?? null, config.dyeDissipation ** frames);
    this.bindTexture(0, this.velocity.read.texture, programs.advection.uniforms.uVelocity);
    this.bindTexture(1, this.dye.read.texture, programs.advection.uniforms.uSource);
    this.draw(this.dye.write);
    this.dye.swap();
  }

  bindTexture(unit: number, texture: WebGLTexture, location: WebGLUniformLocation | null | undefined): void {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(location ?? null, unit);
  }

  draw(target: Target | null, width?: number, height?: number): void {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
    gl.viewport(0, 0, target?.width ?? width ?? gl.drawingBufferWidth, target?.height ?? height ?? gl.drawingBufferHeight);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    this.disposeTargets();
    for (const program of Object.values(this.programs)) this.gl.deleteProgram(program.program);
    this.gl.deleteVertexArray(this.vao);
  }

  private createTarget(width: number, height: number, internalFormat: number, format: number): Target {
    const { gl } = this;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw new Error("Could not allocate fluid target");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, gl.HALF_FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { texture, framebuffer, width, height };
  }

  private createDouble(width: number, height: number, internalFormat: number, format: number): DoubleTarget {
    return new DoubleTarget(
      this.createTarget(width, height, internalFormat, format),
      this.createTarget(width, height, internalFormat, format),
    );
  }

  private disposeTargets(): void {
    const targets: Target[] = [];
    if (this.velocity) targets.push(this.velocity.read, this.velocity.write);
    if (this.dye) targets.push(this.dye.read, this.dye.write);
    if (this.pressure) targets.push(this.pressure.read, this.pressure.write);
    if (this.divergence) targets.push(this.divergence);
    if (this.curl) targets.push(this.curl);
    for (const target of targets) {
      this.gl.deleteTexture(target.texture);
      this.gl.deleteFramebuffer(target.framebuffer);
    }
  }
}
