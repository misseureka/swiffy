var express = require( "express" );
var multer = require( 'multer' );
var fs = require( 'fs' );
var path = require( 'path' );
var convert = require( 'swiffy-convert' );
var async = require( './async' );
var easyZip = require( 'easy-zip' ).EasyZip;
var app = express();

var storage = multer.diskStorage( {
  destination: function ( req, file, cb ) {
    var dest = path.join( './uploads', req.query.rnd );
    try {
      stat = fs.statSync( dest );
    } catch ( err ) {
      fs.mkdirSync( dest );
    }
    cb( null, dest )
  },
  filename: function ( req, file, cb ) {
    cb( null, file.originalname );
  }
} );

var upload = multer( { storage: storage } ).array( 'banners[]' );

app.get( '/', function ( req, res ) {
  res.sendFile( path.join( __dirname, "index.html" ) );
} );

app.get( '/:file(*)', function ( req, res, next ) {
  var file = req.params.file;
  try {
    res.download( path.join( __dirname, 'uploads', file.slice( 0, -4 ), file ) );
  }
  catch ( err ) {
    res.send( 'File not exist' );
  }
} );

app.post( '/upload', function ( req, res ) {
  upload( req, res, function ( err ) {
    if ( err ) {
      res.send( { error: 'An error occurred when uploading' } );
      return;
    }

    createDirectory( path.join( './uploads', req.query.rnd, 'converted' ) );

    var isYandex = req.query.yandex == 'true' ? true : false,
      isGoogle = req.query.google == 'true' ? true : false,
      isDBM = req.query.dbm == 'true' ? true : false;

    var yandexFolder = path.join( './uploads', req.query.rnd, 'converted/yandex' ),
      googleFolder = path.join( './uploads', req.query.rnd, 'converted/google' ),
      dbmFolder = path.join( './uploads', req.query.rnd, 'converted/dbm' );

    if ( isYandex ) {
      createDirectory( yandexFolder );
    }
    if ( isGoogle ) {
      createDirectory( googleFolder );
    }
    if ( isDBM ) {
      createDirectory( dbmFolder );
    }

    var convFns = {};

    if ( isYandex ) {
      req.files.forEach( function ( file, i ) {
        if(file.size == 0){
          return;
        }
        var fileName = file.filename.slice( 0, -4 ),
          filePath = file.path;
        convFns['yandex_' + fileName] = function ( callbackToNextConvert ) {
          convert( filePath, function ( err, result ) {
            if ( err ) {
              callbackToNextConvert( null, false );
            }
            var resFile = result.output.html;
            resFile = resFile.replace( /<title>[^]+<\/title>/, '<title>banner</title>' );
            fs.writeFileSync( path.join( yandexFolder, fileName + '.html' ), resFile );
            callbackToNextConvert( null, true );
          } );
        }
      } );
    }

    if ( isGoogle ) {
      req.files.forEach( function ( file, i ) {
        if(file.size == 0){
          return;
        }
        var fileName = file.filename.slice( 0, -4 ),
          filePath = file.path;
        convFns['google_' + fileName] = function ( callbackToNextConvert ) {
          convert( filePath, function ( err, result ) {
            if ( err ) {
              callbackToNextConvert( null, false );
            }
            var resFile = result.output.html;
            resFile = resFile.replace( /<title>[^]+<\/title>/, '<title>banner</title>' );
            var codeToReplace = resFile.match( /<div id="swiffycontainer"[^]+<\/div>/ )[0];
            resFile = resFile.replace( /<div id="swiffycontainer"[^]+<\/div>/, '<a href="$SHOP_URL" target="_blank">\n' + codeToReplace + '\n</a>' );
            fs.writeFileSync( path.join( googleFolder, fileName + '.html' ), resFile );
            callbackToNextConvert( null, true );
          } );
        };
      } );
    }

    if ( isDBM ) {
      var dbmPage = decodeURIComponent( req.query.dbmPage );
      req.files.forEach( function ( file, i ) {
        if(file.size == 0){
          return;
        }
        var fileName = file.filename.slice( 0, -4 ),
          filePath = file.path;
        convFns['dbm_' + fileName] = function ( callbackToNextConvert ) {
          convert( filePath, function ( err, result ) {
            if ( err ) {
              callbackToNextConvert( null, false );
            }
            var resFile = result.output.html;
            resFile = resFile.replace( /<title>[^]+<\/title>/, '<title>banner</title>' );
            resFile = resFile.replace( '</head>', '<script type="text/javascript">var clickTag = "' + dbmPage + '";</script>\n</head>' );
            var codeToReplace = resFile.match( /<div id="swiffycontainer"[^]+<\/div>/ )[0];
            resFile = resFile.replace( /<div id="swiffycontainer"[^]+<\/div>/, '<a href="javascript:window.open(window.clickTag)" target="_blank">\n' + codeToReplace + '\n</a>' );
            var zip = new easyZip();
            zip.file( fileName + '.html', resFile );
            zip.writeToFile( path.join( dbmFolder, fileName + '.zip' ) );
            callbackToNextConvert( null, true );
          } );
        };
      } );
    }

    async.series( convFns,
     function ( err, results ) {
       if ( err ) {
         res.send( { error: 'An error occurred when converting' } );
       }
       else {
         var filesWithProblem = [];
         for ( var key in results ) {
           if ( results[key] == false ) {
             filesWithProblem.push( key );
           }
         }
         var errMsg = filesWithProblem.length > 0 ? 'Problem with converting: ' + filesWithProblem.join( ', ' ) : '';
         
         var zip = new easyZip();
         var zipFile = req.query.rnd + '.zip';
         zip.zipFolder( path.join( './uploads', req.query.rnd, 'converted' ), function () {
           zip.writeToFile( path.join( './uploads', req.query.rnd, zipFile ) );
         } );

         var dwnldFile = path.join( './uploads', req.query.rnd, zipFile );
         waitFor( function () {
           try {
             stat = fs.statSync( dwnldFile );
             return true;
           } catch ( err ) {
             return false;
           }
         }, function () {
           res.send( { link: zipFile, error: errMsg } );
         }, function () {
           res.send( { error: 'Sorry, something going wrong. Try again.' } )
         }, 60000 );
       }
     } );
  } )
} );

app.use( function ( err, req, res, next ) {
  if ( 404 == err.status ) {
    res.statusCode = 404;
    res.send( 'Cant find that file, sorry!' );
  } else {
    next( err );
  }
} );

var createDirectory = function ( folderName ) {
  try {
    stat = fs.statSync( folderName );
  } catch ( err ) {
    fs.mkdirSync( folderName );
  }
}

var waitFor = function ( testFx, onReady, onTimeOut, timeOutMillis ) {
  var maxtimeOutMillis = timeOutMillis ? timeOutMillis : 5000,
      start = new Date().getTime(),
      condition = false;
  interval = setInterval( function () {
    if ( ( new Date().getTime() - start < maxtimeOutMillis ) && !condition ) {
      condition = ( typeof ( testFx ) === "string" ? eval( testFx ) : testFx() );
    } else {
      if ( !condition ) {
        typeof ( onReady ) === "string" ? eval( onTimeOut ) : onTimeOut();
      } else {
        typeof ( onReady ) === "string" ? eval( onReady ) : onReady();
      }
      clearInterval( interval );
    }
  }, 250 );
};

app.set( 'port', process.env.PORT || 3000 );

app.listen( app.get( 'port' ), function () {
  console.log( "Working on port " + app.get( 'port' ) );
} );
