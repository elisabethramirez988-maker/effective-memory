document.addEventListener('DOMContentLoaded', () => {
    let librosCache = [];
    let prestamosCache = [];
    let categoriaActual = '';
    const miListaSeleccion = new Map();
    let ultimoTimestampNotificacion = 0;
    let adminLogueado = false;
    let imagenBase64Temporal = '';

    // SPLASH SCREEN ANIMACIÓN
    const splash = document.getElementById('splash-screen');
    const progressBar = document.getElementById('progress-bar');
    let progreso = 0;
    const intervaloSplash = setInterval(() => {
        progreso += 25;
        progressBar.style.width = `${progreso}%`;
        if (progreso >= 100) {
            clearInterval(intervaloSplash);
            setTimeout(() => splash.classList.add('fade-out'), 300);
        }
    }, 200);

    // NAVEGACIÓN INFERIOR
    const navButtons = document.querySelectorAll('.bnav-item');
    const vistas = document.querySelectorAll('.vista');

    function cambiarVista(targetId) {
        vistas.forEach(v => v.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');
        navButtons.forEach(b => {
            b.classList.toggle('active', b.dataset.target === targetId || (targetId === 'vista-panel-admin' && b.id === 'nav-admin-btn'));
        });
    }

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            let destino = btn.dataset.target;
            if (destino === 'vista-login-admin' && adminLogueado) {
                destino = 'vista-panel-admin';
            }
            cambiarVista(destino);
            if (destino === 'vista-mi-lista') renderizarMiLista();
        });
    });

    window.irInicio = function() {
        cambiarVista('vista-estudiante');
    };

    window.compartirPagina = function() {
        navigator.clipboard.writeText(window.location.href);
        alert("¡Enlace de la biblioteca copiado al portapapeles! Ya puedes compartirlo.");
    };

    // SONDEO NOTIFICACIONES EN VIVO
    async function comprobarNotificaciones() {
        try {
            const res = await fetch('/api/notificaciones');
            const data = await res.json();
            if (data.timestamp && data.timestamp > ultimoTimestampNotificacion) {
                if (ultimoTimestampNotificacion !== 0) {
                    const alerta = document.getElementById('alerta-actualizacion');
                    document.getElementById('texto-alerta').textContent = `🔔 ${data.mensaje}`;
                    alerta.classList.remove('oculto');
                    cargarLibros();
                }
                ultimoTimestampNotificacion = data.timestamp;
            }
        } catch (e) {}
    }
    setInterval(comprobarNotificaciones, 3500);

    window.cerrarAlerta = function() {
        document.getElementById('alerta-actualizacion').classList.add('oculto');
    };

    // CARGAR LIBROS
    async function cargarLibros() {
        const res = await fetch('/api/libros');
        librosCache = await res.json();
        renderizarCatalogo();
        actualizarSelectLibrosAdmin();
    }

    // RENDERIZAR CATÁLOGO Y BUSCADOR
    function renderizarCatalogo() {
        const texto = document.getElementById('buscar-libro').value.toLowerCase().trim();
        const filtrados = librosCache.filter(l => {
            const matchTexto = l.titulo.toLowerCase().includes(texto) || l.autor.toLowerCase().includes(texto) || l.categoria.toLowerCase().includes(texto);
            const matchCat = categoriaActual === '' || l.categoria === categoriaActual;
            return matchTexto && matchCat;
        });

        const gridDestacados = document.getElementById('grid-destacados');
        const gridTodos = document.getElementById('grid-todos');
        gridDestacados.innerHTML = '';
        gridTodos.innerHTML = '';

        if (filtrados.length === 0) {
            gridTodos.innerHTML = `<p class="estado-vacio">No hay libros registrados en esta sección todavía.</p>`;
            return;
        }

        filtrados.slice(0, 4).forEach(libro => {
            gridDestacados.appendChild(crearTarjetaLibro(libro));
        });

        filtrados.forEach(libro => {
            gridTodos.appendChild(crearTarjetaLibro(libro));
        });
    }

    function crearTarjetaLibro(libro) {
        const div = document.createElement('div');
        div.className = 'libro-poster';
        div.innerHTML = `
            <div class="poster-img-box">
                <img src="${libro.imagen}" alt="${libro.titulo}">
                ${libro.nuevo ? '<span class="badge-new">NUEVO</span>' : ''}
                ${!libro.disponible ? '<span class="badge-out">PRESTADO</span>' : ''}
            </div>
            <div class="poster-titulo">${libro.titulo}</div>
            <div class="poster-cat">${libro.categoria}</div>
        `;
        div.addEventListener('click', () => abrirDetalleLibro(libro));
        return div;
    }

    // MODAL DE DETALLE DEL LIBRO
    function abrirDetalleLibro(libro) {
        document.getElementById('modal-img').src = libro.imagen;
        document.getElementById('modal-cat-badge').textContent = libro.categoria;
        document.getElementById('modal-titulo').textContent = libro.titulo;
        document.getElementById('modal-autor').textContent = `Autor: ${libro.autor}`;
        document.getElementById('modal-descripcion').textContent = libro.descripcion;

        const estadoTxt = document.getElementById('modal-estado-texto');
        const btnElegir = document.getElementById('modal-btn-elegir');

        if (libro.disponible) {
            estadoTxt.textContent = '✅ Disponible para préstamo gratuito (6 días)';
            estadoTxt.style.color = '#16a34a';
            btnElegir.disabled = false;
            btnElegir.textContent = miListaSeleccion.has(libro.id) ? 'QUITAR DE MI LISTA' : 'SELECCIONAR LIBRO';
            btnElegir.onclick = () => {
                if (miListaSeleccion.has(libro.id)) {
                    miListaSeleccion.delete(libro.id);
                } else {
                    miListaSeleccion.set(libro.id, libro);
                }
                actualizarBadgeContador();
                window.cerrarModalLibro();
            };
        } else {
            estadoTxt.textContent = '❌ Actualmente prestado a otro estudiante';
            estadoTxt.style.color = '#dc2626';
            btnElegir.disabled = true;
            btnElegir.textContent = 'NO DISPONIBLE';
        }

        document.getElementById('modal-detalle-libro').classList.remove('oculto');
    }

    window.cerrarModalLibro = function() {
        document.getElementById('modal-detalle-libro').classList.add('oculto');
    };

    function actualizarBadgeContador() {
        const badge = document.getElementById('badge-contador');
        if (miListaSeleccion.size > 0) {
            badge.textContent = miListaSeleccion.size;
            badge.classList.remove('oculto');
        } else {
            badge.classList.add('oculto');
        }
    }

    function renderizarMiLista() {
        const cont = document.getElementById('contenedor-seleccionados');
        const vacio = document.getElementById('aviso-vacio');
        cont.innerHTML = '';

        if (miListaSeleccion.size === 0) {
            vacio.classList.remove('oculto');
            return;
        }
        vacio.classList.add('oculto');

        miListaSeleccion.forEach((libro, id) => {
            const item = document.createElement('div');
            item.className = 'item-seleccionado';
            item.innerHTML = `
                <div>
                    <strong>${libro.titulo}</strong><br>
                    <small>${libro.categoria} • ${libro.autor}</small>
                </div>
                <button class="btn-gris" onclick="window.quitarDeLista(${id})">Quitar</button>
            `;
            cont.appendChild(item);
        });
    }

    window.quitarDeLista = function(id) {
        miListaSeleccion.delete(id);
        actualizarBadgeContador();
        renderizarMiLista();
    };

    document.querySelectorAll('.cat-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            categoriaActual = tab.dataset.cat;
            renderizarCatalogo();
        });
    });

    document.getElementById('buscar-libro').addEventListener('input', renderizarCatalogo);

    document.getElementById('libro-foto-archivo').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            imagenBase64Temporal = ev.target.result;
            const prev = document.getElementById('preview-foto');
            prev.src = imagenBase64Temporal;
            prev.classList.remove('oculto');
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('form-login-admin').addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('admin-password').value;
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        if (res.ok) {
            adminLogueado = true;
            document.getElementById('login-error').textContent = '';
            document.getElementById('admin-password').value = '';
            cambiarVista('vista-panel-admin');
            inicializarFechasFormulario();
            cargarPrestamos();
        } else {
            document.getElementById('login-error').textContent = '❌ Contraseña incorrecta';
        }
    });

    document.getElementById('btn-cerrar-sesion').addEventListener('click', async () => {
        await fetch('/api/admin/logout', { method: 'POST' });
        adminLogueado = false;
        cambiarVista('vista-login-admin');
    });

    document.getElementById('form-nuevo-libro').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            titulo: document.getElementById('libro-titulo').value,
            autor: document.getElementById('libro-autor').value,
            categoria: document.getElementById('libro-categoria').value,
            descripcion: document.getElementById('libro-descripcion').value,
            imagen: imagenBase64Temporal
        };

        const res = await fetch('/api/libros', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            e.target.reset();
            document.getElementById('preview-foto').classList.add('oculto');
            imagenBase64Temporal = '';
            cargarLibros();
            alert('¡Libro registrado con etiqueta NUEVO y notificación enviada!');
        }
    });

    function inicializarFechasFormulario() {
        const hoy = new Date();
        const limite = new Date();
        limite.setDate(hoy.getDate() + 6);

        const inputPrestamo = document.getElementById('input-fecha-prestamo');
        const inputEntrega = document.getElementById('input-fecha-entrega');

        inputPrestamo.value = hoy.toISOString().split('T')[0];
        inputEntrega.value = limite.toISOString().split('T')[0];

        inputPrestamo.addEventListener('change', () => {
            if (inputPrestamo.value) {
                const nuevaFecha = new Date(inputPrestamo.value + 'T00:00:00');
                nuevaFecha.setDate(nuevaFecha.getDate() + 6);
                inputEntrega.value = nuevaFecha.toISOString().split('T')[0];
            }
        });
    }

    function actualizarSelectLibrosAdmin() {
        const select = document.getElementById('est-libros');
        select.innerHTML = '';
        librosCache.filter(l => l.disponible).forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.titulo;
            opt.textContent = `[${l.categoria}] ${l.titulo} - ${l.autor}`;
            select.appendChild(opt);
        });
    }

    document.getElementById('form-nuevo-prestamo').addEventListener('submit', async (e) => {
        e.preventDefault();
        const select = document.getElementById('est-libros');
        const librosSel = Array.from(select.selectedOptions).map(o => o.value);
        if (librosSel.length === 0) return alert('Selecciona al menos un libro disponible.');

        const payload = {
            nombre_estudiante: document.getElementById('est-nombre').value,
            correo_estudiante: document.getElementById('est-correo').value,
            libros: librosSel,
            grado_curso: document.getElementById('est-grado').value,
            maestro_encargado: document.getElementById('est-maestro').value,
            fecha_prestamo: document.getElementById('input-fecha-prestamo').value,
            fecha_entrega: document.getElementById('input-fecha-entrega').value
        };

        const res = await fetch('/api/prestamos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            e.target.reset();
            inicializarFechasFormulario();
            cargarLibros();
            cargarPrestamos();
            alert('Préstamo registrado exitosamente.');
        }
    });

    async function cargarPrestamos() {
        const res = await fetch('/api/prestamos');
        if (!res.ok) return;
        prestamosCache = await res.json();
        const tbody = document.querySelector('#tabla-prestamos tbody');
        tbody.innerHTML = '';

        if (prestamosCache.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="estado-vacio">No hay préstamos registrados actualmente.</td></tr>`;
            return;
        }

        prestamosCache.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${p.nombre_estudiante}</strong><br><small>${p.correo_estudiante}</small></td>
                <td>${p.grado_curso}<br><small>Prof: ${p.maestro_encargado}</small></td>
                <td>${p.libros}</td>
                <td>${p.fecha_prestamo}</td>
                <td><strong>${p.fecha_entrega}</strong></td>
                <td>${p.recordatorio_enviado ? '✅ Enviado' : '⏳ ' + p.fecha_recordatorio}</td>
                <td>
                    ${p.devuelto ? '✅ Devuelto' : `
                        <button class="btn-export" onclick="window.abrirModalEditarFechas(${p.id})" title="Editar Fechas">✏️ Fechas</button>
                        <button class="btn-dorado" onclick="window.devolverLibro(${p.id})">Devolver</button>
                    `}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.abrirModalEditarFechas = function(id) {
        const p = prestamosCache.find(item => item.id === id);
        if (!p) return;
        document.getElementById('edit-prestamo-id').value = p.id;
        document.getElementById('edit-estudiante-nombre').textContent = `Estudiante: ${p.nombre_estudiante}`;
        document.getElementById('edit-fecha-prestamo').value = p.fecha_prestamo;
        document.getElementById('edit-fecha-entrega').value = p.fecha_entrega;
        document.getElementById('modal-editar-fechas').classList.remove('oculto');
    };

    window.cerrarModalEditarFechas = function() {
        document.getElementById('modal-editar-fechas').classList.add('oculto');
    };

    window.guardarEdicionFechas = async function() {
        const id = document.getElementById('edit-prestamo-id').value;
        const fecha_prestamo = document.getElementById('edit-fecha-prestamo').value;
        const fecha_entrega = document.getElementById('edit-fecha-entrega').value;

        await fetch(`/api/prestamos/editar/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fecha_prestamo, fecha_entrega })
        });
        window.cerrarModalEditarFechas();
        cargarPrestamos();
        alert('Fechas actualizadas correctamente.');
    };

    window.devolverLibro = async function(id) {
        await fetch(`/api/prestamos/devolver/${id}`, { method: 'POST' });
        cargarLibros();
        cargarPrestamos();
    };

    document.getElementById('btn-enviar-recordatorios').addEventListener('click', async () => {
        const res = await fetch('/api/verificar-recordatorios', { method: 'POST' });
        const data = await res.json();
        alert(data.mensaje);
        cargarPrestamos();
    });

    window.exportarExcel = function() {
        let csv = "\uFEFFEstudiante,Correo,Grado/Curso,Maestro,Libros,Fecha Prestamo,Fecha Entrega,Estado\n";
        prestamosCache.forEach(p => {
            csv += `"${p.nombre_estudiante}","${p.correo_estudiante}","${p.grado_curso}","${p.maestro_encargado}","${p.libros}","${p.fecha_prestamo}","${p.fecha_entrega}","${p.devuelto ? 'Devuelto' : 'Activo'}"\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Registro_Biblioteca_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    window.exportarWord = function() {
        let html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset='utf-8'><title>Registro Biblioteca</title></head><body><h2>Reporte de Biblioteca Escolar</h2><table border='1' style='border-collapse:collapse;width:100%'><tr><th>Estudiante</th><th>Grado/Curso</th><th>Maestro</th><th>Libros</th><th>Préstamo</th><th>Entrega</th></tr>`;
        prestamosCache.forEach(p => {
            html += `<tr><td>${p.nombre_estudiante}</td><td>${p.grado_curso}</td><td>${p.maestro_encargado}</td><td>${p.libros}</td><td>${p.fecha_prestamo}</td><td>${p.fecha_entrega}</td></tr>`;
        });
        html += `</table></body></html>`;
        const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Registro_Biblioteca_${new Date().toISOString().split('T')[0]}.doc`;
        a.click();
    };

    window.exportarPDF = function() {
        window.print();
    };

    window.exportarRespaldo = async function() {
        const res = await fetch('/api/admin/exportar');
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `respaldo_biblioteca_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    };

    window.importarRespaldo = async function(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const jsonContent = JSON.parse(e.target.result);
                const res = await fetch('/api/admin/importar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(jsonContent)
                });
                if (res.ok) {
                    alert('¡Respaldo importado con éxito!');
                    cargarLibros();
                    cargarPrestamos();
                } else {
                    alert('Error al importar el archivo.');
                }
            } catch (err) {
                alert('El archivo no tiene un formato válido.');
            }
        };
        reader.readAsText(file);
    };

    cargarLibros();
});