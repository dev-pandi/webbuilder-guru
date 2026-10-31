<?php
/**
 * Aturan URL: /{rubrik} untuk arsip, /{rubrik}/{slug} untuk artikel.
 *
 * Dibuat manual karena dua perilaku core:
 *   1. register_taxonomy() mengganti rewrite slug kosong dengan nama taxonomy,
 *      jadi mustahil mendapat /{rubrik} lewat argumen rewrite biasa.
 *   2. %placeholder% di rewrite slug post type tidak di-substitusi tanpa
 *      rewrite tag, dan perilakunya sulit diprediksi.
 *
 * Regex memakai daftar rubrik yang sudah pasti (bukan ([^/]+) serakah) supaya
 * URL satu segmen lain — page, kategori, author — tidak ikut tertangkap.
 */

declare( strict_types=1 );

namespace RDG;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Rewrites {

	public static function init(): void {
		add_action( 'init', array( self::class, 'add_rules' ), 12 );
	}

	public static function add_rules(): void {
		$rubrik = implode( '|', array_map( 'preg_quote', array_keys( Post_Types::RUBRIK ) ) );

		// Artikel: /{rubrik}/{slug}
		add_rewrite_rule(
			'^(' . $rubrik . ')/([^/]+)/?$',
			'index.php?guru_article=$matches[2]',
			'top'
		);

		// Arsip rubrik berhalaman: /{rubrik}/page/2
		add_rewrite_rule(
			'^(' . $rubrik . ')/page/([0-9]{1,})/?$',
			'index.php?rubrik=$matches[1]&paged=$matches[2]',
			'top'
		);

		// Arsip rubrik: /{rubrik}
		add_rewrite_rule(
			'^(' . $rubrik . ')/?$',
			'index.php?rubrik=$matches[1]',
			'top'
		);
	}

	/**
	 * Daftar aturan untuk diperiksa manusia / test. Dipakai di dokumentasi dan
	 * saat verifikasi di instalasi WP nyata.
	 */
	public static function expected_urls(): array {
		$out = array();
		foreach ( array_keys( Post_Types::RUBRIK ) as $slug ) {
			$out[] = '/' . $slug;
			$out[] = '/' . $slug . '/contoh-judul-artikel';
		}
		return $out;
	}
}
