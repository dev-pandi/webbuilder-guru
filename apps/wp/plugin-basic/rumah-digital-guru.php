<?php
/**
 * Plugin Name:       Rumah Digital Guru
 * Description:       Situs guru: artikel per rubrik, materi ajar, tanggapan murid & orang tua, dan banner.
 * Version:           0.1.0
 * Requires at least: 6.5
 * Requires PHP:      8.1
 * License:           GPLv2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       rumah-digital-guru
 *
 * Plugin ini memegang DATA (custom post type + taxonomy). Tampilan ada di theme
 * terpisah. Pemisahan ini disengaja: kalau CPT didaftarkan dari theme, guru yang
 * ganti theme kehilangan seluruh artikel dan materinya.
 */

declare( strict_types=1 );

namespace RDG;

// Dipanggil langsung lewat URL = hentikan. Pola wajib tiap file plugin WP.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const VERSION     = '0.1.0';
const PLUGIN_FILE = __FILE__;

require_once __DIR__ . '/includes/class-post-types.php';
require_once __DIR__ . '/includes/class-rewrites.php';

Post_Types::init();
Rewrites::init();

// Rewrite rule CPT baru terdaftar setelah flush. Hanya saat aktivasi — flush
// tiap request itu mahal dan tidak perlu.
register_activation_hook(
	__FILE__,
	static function (): void {
		Post_Types::register();
		Rewrites::add_rules();
		flush_rewrite_rules();
	}
);

register_deactivation_hook( __FILE__, 'flush_rewrite_rules' );
