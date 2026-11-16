from datetime import datetime, timedelta
from email.mime.text import MIMEText
import json
import os
import smtplib
from flask import Flask, jsonify, render_template, request, session

app = Flask(__name__)
app.secret_key = 'biblioteca_escolar_super_secreta_2026'
DATA_FILE = 'datos_biblioteca.json'

estado_notificacion = {'mensaje': '', 'timestamp': 0, 'categoria': ''}

SMTP_SERVER = 'smtp.gmail.com'
SMTP_PORT = 587
EMAIL_REMITENTE = 'tu_correo_biblioteca@gmail.com'
EMAIL_PASSWORD = 'tu_contraseña_de_aplicacion'


def cargar_datos():
  if not os.path.exists(DATA_FILE):
    datos_iniciales = {'libros': [], 'prestamos': []}
    guardar_datos(datos_iniciales)
    return datos_iniciales
  with open(DATA_FILE, 'r', encoding='utf-8') as f:
    return json.load(f)


def guardar_datos(datos):
  with open(DATA_FILE, 'w', encoding='utf-8') as f:
    json.dump(datos, f, indent=4, ensure_ascii=False)


def enviar_correo_recordatorio(
    destinatario, nombre_estudiante, libros, fecha_entrega
):
  asunto = 'Recordatorio: Entrega de libros de la Biblioteca Escolar'
  cuerpo = (
      f'Hola {nombre_estudiante},\n\nTe recordamos que faltan 2 días para la'
      f' fecha límite de entrega de tus libros:\n- {libros}\n\nFecha límite:'
      f' {fecha_entrega}\n¡Gracias por cuidar nuestros libros!'
  )
  msg = MIMEText(cuerpo)
  msg['Subject'] = asunto
  msg['From'] = EMAIL_REMITENTE
  msg['To'] = destinatario
  try:
    server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
    server.starttls()
    server.login(EMAIL_REMITENTE, EMAIL_PASSWORD)
    server.sendmail(EMAIL_REMITENTE, destinatario, msg.as_string())
    server.quit()
    return True
  except Exception:
    print(f'[Simulación Correo -> {destinatario}]: {cuerpo}')
    return False


@app.route('/')
def index():
  return render_template('index.html')


@app.route('/api/libros', methods=['GET'])
def obtener_libros():
  return jsonify(cargar_datos()['libros'])


@app.route('/api/libros', methods=['POST'])
def agregar_libro():
  if not session.get('admin_autenticado'):
    return jsonify({'error': 'No autorizado'}), 403

  datos = cargar_datos()
  nuevo = request.json
  nuevo_id = max([l['id'] for l in datos['libros']], default=0) + 1
  categoria = nuevo.get('categoria', 'General')

  libro = {
      'id': nuevo_id,
      'titulo': nuevo['titulo'],
      'autor': nuevo['autor'],
      'categoria': categoria,
      'descripcion': nuevo.get(
          'descripcion', 'Libro disponible en el catálogo escolar.'
      ),
      'imagen': nuevo.get(
          'imagen',
          'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=400&q=80',
      ),
      'disponible': True,
      'nuevo': True,
  }
  datos['libros'].insert(0, libro)
  guardar_datos(datos)

  global estado_notificacion
  estado_notificacion = {
      'mensaje': (
          '¡Biblioteca actualizada! Se agregó un nuevo libro en la'
          f' clasificación: {categoria.upper()}'
      ),
      'categoria': categoria,
      'timestamp': datetime.now().timestamp(),
  }
  return jsonify({'mensaje': 'Libro registrado', 'libro': libro})


@app.route('/api/notificaciones', methods=['GET'])
def obtener_notificacion():
  return jsonify(estado_notificacion)


@app.route('/api/admin/login', methods=['POST'])
def admin_login():
  if request.json.get('password') == 'welcome@01':
    session['admin_autenticado'] = True
    return jsonify({'exito': True})
  return jsonify({'exito': False}), 401


@app.route('/api/admin/logout', methods=['POST'])
def admin_logout():
  session.pop('admin_autenticado', None)
  return jsonify({'exito': True})


@app.route('/api/prestamos', methods=['GET'])
def obtener_prestamos():
  if not session.get('admin_autenticado'):
    return jsonify({'error': 'No autorizado'}), 403
  return jsonify(cargar_datos()['prestamos'])


@app.route('/api/prestamos', methods=['POST'])
def registrar_prestamo():
  if not session.get('admin_autenticado'):
    return jsonify({'error': 'No autorizado'}), 403

  datos = cargar_datos()
  req = request.json

  fecha_prestamo_str = req.get('fecha_prestamo') or datetime.now().strftime(
      '%Y-%m-%d'
  )
  fecha_prestamo_dt = datetime.strptime(fecha_prestamo_str, '%Y-%m-%d')

  fecha_entrega_str = req.get('fecha_entrega') or (
      fecha_prestamo_dt + timedelta(days=6)
  ).strftime('%Y-%m-%d')
  fecha_entrega_dt = datetime.strptime(fecha_entrega_str, '%Y-%m-%d')

  fecha_recordatorio_str = (fecha_entrega_dt - timedelta(days=2)).strftime(
      '%Y-%m-%d'
  )

  libros_sel = req['libros']
  for libro in datos['libros']:
    if libro['titulo'] in libros_sel:
      libro['disponible'] = False

  nuevo_prestamo = {
      'id': len(datos['prestamos']) + 1,
      'nombre_estudiante': req['nombre_estudiante'],
      'correo_estudiante': req['correo_estudiante'],
      'libros': ', '.join(libros_sel),
      'grado_curso': req['grado_curso'],
      'maestro_encargado': req['maestro_encargado'],
      'fecha_prestamo': fecha_prestamo_str,
      'fecha_entrega': fecha_entrega_str,
      'fecha_recordatorio': fecha_recordatorio_str,
      'recordatorio_enviado': False,
      'devuelto': False,
  }
  datos['prestamos'].append(nuevo_prestamo)
  guardar_datos(datos)
  return jsonify({'mensaje': 'Préstamo registrado exitosamente'})


@app.route('/api/prestamos/editar/<int:prestamo_id>', methods=['PUT'])
def editar_fechas_prestamo(prestamo_id):
  if not session.get('admin_autenticado'):
    return jsonify({'error': 'No autorizado'}), 403

  datos = cargar_datos()
  req = request.json
  for p in datos['prestamos']:
    if p['id'] == prestamo_id:
      p['fecha_prestamo'] = req['fecha_prestamo']
      p['fecha_entrega'] = req['fecha_entrega']
      fecha_ent_dt = datetime.strptime(req['fecha_entrega'], '%Y-%m-%d')
      p['fecha_recordatorio'] = (fecha_ent_dt - timedelta(days=2)).strftime(
          '%Y-%m-%d'
      )
      break
  guardar_datos(datos)
  return jsonify({'mensaje': 'Fechas actualizadas'})


@app.route('/api/prestamos/devolver/<int:prestamo_id>', methods=['POST'])
def devolver_libro(prestamo_id):
  if not session.get('admin_autenticado'):
    return jsonify({'error': 'No autorizado'}), 403
  datos = cargar_datos()
  for p in datos['prestamos']:
    if p['id'] == prestamo_id:
      p['devuelto'] = True
      titulos = [t.strip() for t in p['libros'].split(',')]
      for libro in datos['libros']:
        if libro['titulo'] in titulos:
          libro['disponible'] = True
      break
  guardar_datos(datos)
  return jsonify({'mensaje': 'Devuelto'})


@app.route('/api/verificar-recordatorios', methods=['POST'])
def verificar_recordatorios():
  if not session.get('admin_autenticado'):
    return jsonify({'error': 'No autorizado'}), 403
  datos = cargar_datos()
  hoy = datetime.now().date()
  enviados = 0
  for p in datos['prestamos']:
    if not p['devuelto'] and not p['recordatorio_enviado']:
      fecha_ent = datetime.strptime(p['fecha_entrega'], '%Y-%m-%d').date()
      if (fecha_ent - hoy).days <= 2:
        enviar_correo_recordatorio(
            p['correo_estudiante'],
            p['nombre_estudiante'],
            p['libros'],
            p['fecha_entrega'],
        )
        p['recordatorio_enviado'] = True
        enviados += 1
  guardar_datos(datos)
  return jsonify({'mensaje': f'Se enviaron {enviados} recordatorios.'})


@app.route('/api/admin/exportar', methods=['GET'])
def exportar_datos():
  if not session.get('admin_autenticado'):
    return jsonify({'error': 'No autorizado'}), 403
  return jsonify(cargar_datos())


@app.route('/api/admin/importar', methods=['POST'])
def importar_datos():
  if not session.get('admin_autenticado'):
    return jsonify({'error': 'No autorizado'}), 403
  datos = request.json
  if 'libros' in datos and 'prestamos' in datos:
    guardar_datos(datos)
    return jsonify({'mensaje': 'Datos importados correctamente'})
  return jsonify({'error': 'Formato inválido'}), 400


if __name__ == '__main__':
  app.run(debug=True)