import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const planetSpecs = [
  { name: 'Kepler-like candidate', radius: 0.72, orbit: 4.35, speed: 0.72, color: 0x86efac, tilt: 0.1, angle: 0.15 },
  { name: 'Outer gas world', radius: 0.92, orbit: 6.35, speed: 0.42, color: 0x7dd3fc, tilt: -0.3, angle: 2.05 },
  { name: 'Warm rocky world', radius: 0.62, orbit: 8.1, speed: 0.31, color: 0xfbbf77, tilt: 0.42, angle: 4.25 }
]

function makeStarTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const context = canvas.getContext('2d')
  const gradient = context.createRadialGradient(48, 48, 0, 48, 48, 48)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.24, 'rgba(196,231,255,0.8)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 96, 96)
  return new THREE.CanvasTexture(canvas)
}

function makePlanetTexture(color) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  const base = new THREE.Color(color).getStyle()
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 62)
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)')
  gradient.addColorStop(0.24, base)
  gradient.addColorStop(0.62, base)
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

export default function SpaceScene({ variant = 'standard', onFocusChange }) {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(48, mount.clientWidth / mount.clientHeight, 0.1, 1200)
    camera.position.set(0, 4.8, variant === 'immersive' ? 15.5 : 14)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setClearColor(0x000000, 0)
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    const pointer = new THREE.Vector2(0, 0)
    const raycaster = new THREE.Raycaster()
    const starTexture = makeStarTexture()
    const starGeometry = new THREE.BufferGeometry()
    const starCount = variant === 'immersive' ? 2400 : 1700
    const positions = new Float32Array(starCount * 3)
    const colors = new Float32Array(starCount * 3)

    for (let i = 0; i < starCount; i += 1) {
      const radius = 24 + Math.random() * 150
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = radius * Math.cos(phi)
      const warmth = 0.72 + Math.random() * 0.28
      colors[i * 3] = warmth
      colors[i * 3 + 1] = 0.82 + Math.random() * 0.18
      colors[i * 3 + 2] = 1
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const starMaterial = new THREE.PointsMaterial({
      size: variant === 'immersive' ? 0.22 : 0.17,
      map: starTexture,
      transparent: true,
      opacity: 0.92,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    const stars = new THREE.Points(starGeometry, starMaterial)
    scene.add(stars)

    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffcc75 })
    const sun = new THREE.Mesh(new THREE.SphereGeometry(1.28, 64, 64), sunMaterial)
    scene.add(sun)

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.95, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0xffa858,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
    glow.renderOrder = 1
    scene.add(glow)

    const transitShadow = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0x111827, transparent: true, opacity: 0.86 })
    )
    transitShadow.position.set(-0.18, 0.18, 1.16)
    scene.add(transitShadow)

    const planets = planetSpecs.map((planet) => {
      const material = new THREE.MeshStandardMaterial({
        color: planet.color,
        roughness: 0.52,
        metalness: 0.08,
        emissive: planet.color,
        emissiveIntensity: 0.34,
        depthTest: false
      })
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(planet.radius, 40, 40), material)
      mesh.userData.name = planet.name
      mesh.renderOrder = 3
      const spriteTexture = makePlanetTexture(planet.color)
      const spriteMaterial = new THREE.SpriteMaterial({
        map: spriteTexture,
        color: planet.color,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
      })
      const sprite = new THREE.Sprite(spriteMaterial)
      sprite.userData.name = planet.name
      sprite.renderOrder = 4

      const orbit = new THREE.Mesh(
        new THREE.RingGeometry(planet.orbit - 0.01, planet.orbit + 0.01, 220),
        new THREE.MeshBasicMaterial({
          color: 0x7dd3fc,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      )
      orbit.rotation.x = Math.PI / 2 + planet.tilt
      scene.add(orbit)
      scene.add(mesh)
      scene.add(sprite)
      return { ...planet, mesh, material, sprite, spriteMaterial, spriteTexture, orbit }
    })

    scene.add(new THREE.AmbientLight(0xa7c7ff, 1.05))
    const light = new THREE.PointLight(0xffdfad, 58, 42)
    light.position.set(0, 0, 0)
    scene.add(light)

    let hovered = null
    let raf = 0
    let frame = 0

    const setHovered = (planet) => {
      if (hovered === planet) return
      hovered = planet
      mount.dataset.focus = planet?.name || ''
      mount.style.cursor = planet ? 'pointer' : 'default'
      if (onFocusChange) onFocusChange(planet?.name || '')
    }

    const onPointerMove = (event) => {
      const rect = mount.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(planets.flatMap((planet) => [planet.mesh, planet.sprite]), false)[0]
      const next = hit ? planets.find((planet) => planet.mesh === hit.object || planet.sprite === hit.object) : null
      setHovered(next || null)
    }

    const onPointerLeave = () => {
      pointer.set(0, 0)
      setHovered(null)
    }

    mount.addEventListener('pointermove', onPointerMove)
    mount.addEventListener('pointerleave', onPointerLeave)

    const animate = () => {
      frame += 0.01
      const targetX = pointer.x * 1.4
      const targetY = 4.6 + pointer.y * 0.7
      camera.position.x += (targetX - camera.position.x) * 0.035
      camera.position.y += (targetY - camera.position.y) * 0.035
      camera.lookAt(0, 0, 0)

      stars.rotation.y += 0.0007 + Math.abs(pointer.x) * 0.00035
      stars.rotation.x += pointer.y * 0.00008
      starMaterial.opacity = 0.78 + Math.sin(frame * 1.8) * 0.08
      glow.scale.setScalar(1 + Math.sin(frame * 2.2) * 0.045)
      transitShadow.position.x = Math.sin(frame * 0.72) * 0.92
      transitShadow.scale.setScalar(1 + Math.sin(frame * 0.72) * 0.12)

      planets.forEach((planet, index) => {
        const angle = frame * planet.speed + planet.angle + index * 0.7
        planet.mesh.position.set(
          Math.cos(angle) * planet.orbit * 0.98,
          Math.sin(angle) * planet.orbit * 0.34 + planet.tilt,
          Math.sin(angle) * planet.orbit * 0.12
        )
        planet.sprite.position.copy(planet.mesh.position)
        planet.mesh.rotation.y += 0.012
        const isHovered = hovered === planet
        const targetScale = isHovered ? 1.55 : 1
        planet.mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08)
        planet.sprite.scale.lerp(
          new THREE.Vector3(planet.radius * 3.1 * targetScale, planet.radius * 3.1 * targetScale, 1),
          0.08
        )
        planet.material.emissiveIntensity += ((isHovered ? 0.72 : 0.34) - planet.material.emissiveIntensity) * 0.08
        planet.spriteMaterial.opacity += ((isHovered ? 1 : 0.72) - planet.spriteMaterial.opacity) * 0.08
        planet.orbit.material.opacity += ((isHovered ? 0.58 : 0.22) - planet.orbit.material.opacity) * 0.06
      })

      renderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    animate()

    const onResize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      mount.removeEventListener('pointermove', onPointerMove)
      mount.removeEventListener('pointerleave', onPointerLeave)
      cancelAnimationFrame(raf)
      renderer.dispose()
      starTexture.dispose()
      starGeometry.dispose()
      starMaterial.dispose()
      sun.geometry.dispose()
      sunMaterial.dispose()
      glow.geometry.dispose()
      glow.material.dispose()
      transitShadow.geometry.dispose()
      transitShadow.material.dispose()
      planets.forEach((planet) => {
        planet.mesh.geometry.dispose()
        planet.material.dispose()
        planet.spriteMaterial.dispose()
        planet.spriteTexture.dispose()
        planet.orbit.geometry.dispose()
        planet.orbit.material.dispose()
      })
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [onFocusChange, variant])

  return <div className={`space-scene ${variant}`} ref={mountRef} aria-label="Animated exoplanet system" />
}
