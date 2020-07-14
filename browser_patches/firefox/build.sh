#!/bin/bash
set -e
set +x

trap "cd $(pwd -P)" EXIT
cd "$(dirname $0)"
cd "checkout"

if [[ "$(uname)" == "Darwin" ]]; then
  # Firefox currently does not build on 10.15 out of the box - it requires SDK for 10.11.
  # Make sure the SDK is out there.
  if ! [[ -d $HOME/SDK-archive/MacOSX10.11.sdk ]]; then
    echo "As of Jun 2020, Firefox does not build on Mac without 10.11 SDK."
    echo "Check out instructions on getting 10.11 sdk at https://firefox-source-docs.mozilla.org/setup/macos_build.html"
    echo "and make sure to put SDK to $HOME/SDK-archive/MacOSX10.11.sdk/"
    exit 1
  else
    echo "-- configuting .mozconfig with 10.11 SDK path"
    echo "ac_add_options --with-macos-sdk=$HOME/SDK-archive/MacOSX10.11.sdk/" > .mozconfig
  fi
  echo "-- building on Mac"
elif [[ "$(uname)" == "Linux" ]]; then
  echo "-- building on Linux"
  echo "ac_add_options --disable-av1" > .mozconfig
  echo "ac_add_options --with-ccache=${HOME}/.mozbuild/sccache/sccache" >> .mozconfig
elif [[ "$(uname)" == MINGW* ]]; then
  if [[ $1 == "--win64" ]]; then
    echo "-- building win64 build on MINGW"
    echo "ac_add_options --target=x86_64-pc-mingw32" > .mozconfig
    echo "ac_add_options --host=x86_64-pc-mingw32" >> .mozconfig
  else
    echo "-- building win32 build on MINGW"
  fi
else
  echo "ERROR: cannot upload on this platform!" 1>&2
  exit 1;
fi

OBJ_FOLDER="obj-build-playwright"
echo "mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/${OBJ_FOLDER}" >> .mozconfig
echo "ac_add_options --disable-tests" >> .mozconfig

if [[ $1 == "--juggler" ]]; then
  ./mach build faster
else
  ./mach build
fi

if [[ "$(uname)" == "Darwin" ]]; then
  node ../install-preferences.js $PWD/${OBJ_FOLDER}/dist
else
  node ../install-preferences.js $PWD/${OBJ_FOLDER}/dist/bin
fi

