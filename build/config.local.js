module.exports = function (config) {
  let img_proc = 'client/img/proc/*.png';
  config.client_static.push(`!${img_proc}`);
  config.img_proc = img_proc;
};
