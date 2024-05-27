# Dockerfile

# Utiliza la última imagen de Jrottenberg FFmpeg como base
FROM jrottenberg/ffmpeg:latest

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copia los archivos del proyecto al contenedor
COPY . .

# Instala las dependencias
RUN npm install

# Expone el puerto en el que tu aplicación se ejecutará
EXPOSE 3000

# Comando para ejecutar tu aplicación cuando se inicie el contenedor
CMD ["node", "app.js"]
