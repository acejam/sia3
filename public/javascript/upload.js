$('.upload-btn').on('click', function () {
  if ($(".upload-btn").hasClass("disabled")) return;
  $('#upload-input').click();
  $('.progress-bar').text('0%');
  $('.progress-bar').width('0%');
});

$('.delete-btn').on('click', function (evt) {
  evt.currentTarget.id
  $.ajax({
    url: evt.currentTarget.id,
    type: 'DELETE',
    processData: false,
    contentType: false,
    success: function (data) {
      console.log('DELETE successful!\n' + data);
    }
  })
});

$('#upload-input').on('change', function () {

  var files = $(this).get(0).files;

  if (files.length > 0) {
    // create a FormData object which will be sent as the data payload in the
    // AJAX request
    var formData = new FormData();

    // loop through all the selected files and add them to the formData object
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (file.size > 1000*1000*1000) {
       alert('Sorry, only files <1Gb right now.  This file size is: ' + this.files[0].size/1000/1000/1000 + "Gb");
       return; //TODO not sure how to error here :/
      }
       // add the files to formData object for the data payload
      formData.append('uploads[]', file, file.name);
    }

    $.ajax({
      url: '/objects',
      type: 'POST',
      data: formData,
      processData: false,
      contentType: false,
      success: function (data) {
        console.log('upload successful!\n' + data);
      },
      xhr: function () {
        // create an XMLHttpRequest
        var xhr = new XMLHttpRequest();

        // listen to the 'progress' event
        xhr.upload.addEventListener('progress', function (evt) {

          if (evt.lengthComputable) {
            // calculate the percentage of upload completed
            var percentComplete = evt.loaded / evt.total;
            percentComplete = parseInt(percentComplete * 100);

            // update the Bootstrap progress bar with the new percentage
            $('.progress-bar').text(percentComplete + '%');
            $('.progress-bar').width(percentComplete + '%');

            // once the upload reaches 100%, set the progress bar text to done
            if (percentComplete === 100) {
              $('.progress-bar').html('Done');
            }

          }

        }, false);

        return xhr;
      }
    });

  }
});
