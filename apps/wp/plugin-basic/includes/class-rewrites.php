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
 * Regex memakai daftar slug rubrik yang sebenarnya (bukan ([^/]+) serakah)
 * supaya URL satu segmen lain — page, kategori, author — tidak ikut tertangkap.
 */

declare( strict_types=1 );

namespace RDG;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Rewrites {

	/**
	 * Slug rubrik di-cache di option (autoload) supaya pembentukan aturan
	 * tidak memicu query term tiap request.
	 */
	private const SLUG_OPTION = 'rdg_rubrik_slugs';

	public static function init(): void {
		add_action( 'init', array( self::class, 'add_rules' ), 12 );

		// Guru boleh menambah rubrik sendiri. Tanpa refresh di sini, rubrik baru
		// punya permalink yang tampil normal di admin tapi 404 saat dibuka.
		foreach ( array( 'created_rubrik', 'edited_rubrik', 'delete_rubrik' ) as $hook ) {
			add_action( $hook, array( self::class, 'refresh_slugs' ) );
		}
	}

	public static function add_rules(): void {
		$rubrik = implode( '|', array_map( 'preg_quote', self::slugs() ) );
		if ( '' === $rubrik ) {
			return;
		}

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
	 * Daftar slug rubrik dari cache. Fallback ke 6 rubrik baku supaya situs baru
	 * tetap punya aturan sebelum cache terisi.
	 */
	public static function slugs(): array {
		$cached = get_option( self::SLUG_OPTION );
		if ( is_array( $cached ) && array() !== $cached ) {
			return $cached;
		}
		return array_keys( Post_Types::RUBRIK );
	}

	/**
	 * Bangun ulang cache slug lalu flush. Dipanggil saat term rubrik berubah
	 * dan saat aktivasi.
	 */
	public static function refresh_slugs(): void {
		$terms = get_terms(
			array(
				'taxonomy'   => 'rubrik',
				'hide_empty' => false,
				'fields'     => 'slugs',
			)
		);

		// get_terms() bisa mengembalikan WP_Error (mis. taxonomy belum siap).
		// Jangan timpa cache dengan data kosong kalau itu terjadi.
		if ( is_wp_error( $terms ) || ! is_array( $terms ) || array() === $terms ) {
			return;
		}

		update_option( self::SLUG_OPTION, array_values( $terms ), true );

		// Aturan dibentuk dari daftar lama, jadi daftarkan ulang sebelum flush.
		self::add_rules();
		flush_rewrite_rules();
	}
}
