# Nix dev shell that provides the native libraries Tauri needs to build a
# Linux desktop bundle (webkit2gtk 4.1, GTK3, libsoup3, librsvg, …) together
# with pkg-config so the Rust build can discover them.
#
# Used by scripts/desktop/build-desktop.sh:
#   nix-shell scripts/desktop/shell.nix --run '<cargo tauri build …>'
{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  nativeBuildInputs = [ pkgs.pkg-config ];
  buildInputs = [
    pkgs.webkitgtk_4_1
    pkgs.gtk3
    pkgs.libsoup_3
    pkgs.librsvg
    pkgs.glib
    pkgs.cairo
    pkgs.pango
    pkgs.gdk-pixbuf
    pkgs.atk
    pkgs.dpkg
  ];
}
