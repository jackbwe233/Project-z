/* Public connection configuration. Do not put Spotify secrets or Apple private signing keys here.
 * Spotify: create a Web API app and register https://YOUR_DOMAIN/music.html as a redirect URI.
 * Apple: generate short-lived MusicKit developer tokens on your own secure backend.
 * This endpoint must return JSON: { "developerToken": "<signed-jwt>" }.
 */
window.Z_MUSIC_CONFIG = {
  spotifyClientId: "",
  appleDeveloperTokenEndpoint: "",
};
