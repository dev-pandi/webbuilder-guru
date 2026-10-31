<?php
/**
 * Rumah Digital Guru — setup tema.
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action(
	'after_setup_theme',
	static function (): void {
		add_theme_support( 'wp-block-styles' );
		add_theme_support( 'responsive-embeds' );
		add_theme_support( 'editor-styles' );
		add_theme_support( 'post-thumbnails' );
		// Stylesheet blok ikut dimuat di dalam editor supaya tampilan saat
		// menyunting sama dengan hasil akhirnya.
		add_editor_style( 'assets/guru.css' );
	}
);

add_action(
	'wp_enqueue_scripts',
	static function (): void {
		$ver = wp_get_theme()->get( 'Version' );

		wp_enqueue_style(
			'rdg-base',
			get_stylesheet_uri(),
			array(),
			is_string( $ver ) ? $ver : null
		);

		wp_enqueue_style(
			'rdg-guru',
			get_theme_file_uri( 'assets/guru.css' ),
			array( 'rdg-base' ),
			is_string( $ver ) ? $ver : null
		);
	}
);
