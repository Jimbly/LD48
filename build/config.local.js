const imgproc = require('./imgproc.js');

module.exports = function (config) {
  let img_proc = 'client/img/proc/*.png';
  config.client_static.push(`!${img_proc}`);
  config.client_register_cbs.push((gb) => {
    config.extra_client_tasks.push('client_img_proc');
    gb.task({
      name: 'client_img_proc',
      input: img_proc,
      target: 'dev',
      ...imgproc()
    });
  });
};
