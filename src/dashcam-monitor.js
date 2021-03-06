#!/bin/node

/* eslint no-bitwise: 0 */
/* eslint no-await-in-loop: 0 */
/* eslint no-constant-condition: 0 */

const fs = require('fs');
const {
  IMAGE_DIR, BACKUP_DIR, IMAGE_MOUNT_POINT, RECORD_WINDOW_MS, IMAGE_SIZE_MB, PAUSE_RECORDING_ON_WIFI, WAIT_INTERVAL
} = require('../etc/config.js');
const { benchmark, execSync, sleep, isOnline } = require('./common.js');

const unmount = (imageNum) => {
  console.log(`Unmounting image ${imageNum}`);
  execSync('sudo /sbin/modprobe -r g_mass_storage');
};

const mount = (imageNum) => {
  console.log(`Preparing to mount image ${imageNum}`);
  execSync(`sudo /sbin/modprobe g_mass_storage file=${IMAGE_DIR}/cam${imageNum} stall=0,0, ro=0,0 removable=1,1`);
};

const mountLocal = (imageNum) => {
  console.log(`Preparing to local mount image ${imageNum}`);
  execSync(`sudo /bin/mount -t vfat -o gid=pi,uid=pi ${IMAGE_DIR}/cam${imageNum} ${IMAGE_MOUNT_POINT}`);
};

const unmountLocal = (imageNum) => {
  console.log(`Preparing to unmount local image ${imageNum}`);
  execSync('sudo /bin/umount /mnt');
};

const fixLocal = (imageNum) => {
  console.log('Attempting to fix image');
  execSync(`fsck -a ${IMAGE_DIR}/cam${imageNum}`);
};

const countFilesInDirectory = dirPath => fs
  .readdirSync(dirPath, { withFileTypes: true })
  .filter(f => f.isFile())
  .length;

const removeErroneousVideos = dirPath => fs
  .readdirSync(dirPath, { withFileTypes: true })
  .filter(f => f.isFile())
  .map(({ name }) => `${dirPath}/${name}`)
  .filter(n => fs.existsSync(n))
  .map(name => {
    const { size } = fs.statSync(name);
    return { name, size };
  })
  .filter(({ size }) => size < 500000)
  .forEach(({ name, size }) => {
    console.log(`Video ${name} is ${size} bytes. Deleting file`);
    execSync(`rm ${name}`);
  });

const copyLocal = (imageNum) => {
  console.log(
    `Preparing to copy videos from ${IMAGE_MOUNT_POINT}/TeslaCam to ${BACKUP_DIR} for image ${imageNum}`,
  );

  const teslacamPath = `${IMAGE_MOUNT_POINT}/TeslaCam`;

  removeErroneousVideos(teslacamPath);

  const filesInPath = countFilesInDirectory(teslacamPath);

  console.log(`Found ${filesInPath} files in ${teslacamPath}`);

  if (filesInPath > 0) {
    const filesBeforeCopy = countFilesInDirectory(BACKUP_DIR);

    execSync(`touch ${BACKUP_DIR}/lock`);
    execSync(`mv ${teslacamPath}/* ${BACKUP_DIR}`);
    execSync(`rm ${BACKUP_DIR}/lock`);

    const filesAfterCopy = countFilesInDirectory(BACKUP_DIR);
    if (filesAfterCopy - filesBeforeCopy < filesInPath) {
      console.log('Copy error, number of files moved is incorrect');
    }
  }
};

const performSanityCheck = () => {
  const createIfNotExists = (dirName) => {
    if (!fs.existsSync(dirName)) {
      fs.mkdirSync(dirName);
    }
  };

  const createImageIfNotExists = (imageNum) => {
    const expectedFilename = `${IMAGE_DIR}/cam${imageNum}`;
    if (!fs.existsSync(expectedFilename)) {
      execSync(`dd bs=1M if=/dev/zero of=${IMAGE_DIR}/cam${imageNum} count=${IMAGE_SIZE_MB}`);
      execSync(`mkdosfs ${IMAGE_DIR}/cam${imageNum} -F 32 -I`);
    }
  };

  const mountAndCheckUsbImage = (imageNum) => {
    const teslaCamDirectoryLocal = `${IMAGE_MOUNT_POINT}/TeslaCam`;
    mountLocal(imageNum);
    createIfNotExists(teslaCamDirectoryLocal);
    const teslaCamFiles = countFilesInDirectory(teslaCamDirectoryLocal);
    if (teslaCamFiles > 0) {
      copyLocal(imageNum);
    } else {
      console.log('No files found');
    }
    unmountLocal(imageNum);
  };

  createIfNotExists(IMAGE_MOUNT_POINT);
  createIfNotExists(IMAGE_DIR);
  createImageIfNotExists(0);
  createImageIfNotExists(1);
  mountAndCheckUsbImage(0);
  mountAndCheckUsbImage(1);
};

const startup = () => {
  console.log('Starting Tesla Sync script');
  unmount('All');
  unmountLocal(0);
  removeErroneousVideos(BACKUP_DIR);

  performSanityCheck();
};

const waitForVideoFiles = async (minusLagTime = 0) => {
  console.log('Waiting for video files');
  await sleep(RECORD_WINDOW_MS - minusLagTime);
};


const processVideo = async (imageNum) => {
  mount(imageNum);

  await waitForVideoFiles();
  unmount(imageNum);
  mount(imageNum ^ 1);

  const elapsedTimeMs = benchmark(() => {
    fixLocal(imageNum);
    mountLocal(imageNum);
    copyLocal(imageNum);
    unmountLocal(imageNum);
  });
  await waitForVideoFiles(elapsedTimeMs);
};

const init = async () => {
  startup();

  let imageNum = 0;

  while (true) {
    if(PAUSE_RECORDING_ON_WIFI && isOnline()){
      await sleep(WAIT_INTERVAL);
    }else{
      await processVideo(imageNum);
      imageNum ^= 1;
    }
  }
};

init();
