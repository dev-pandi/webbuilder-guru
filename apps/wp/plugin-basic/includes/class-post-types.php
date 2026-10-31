<?php
/**
 * Custom post type + taxonomy untuk Rumah Digital Guru.
 *
 * Dipetakan dari skema asli (migrations 0048-0051 di apps/api):
 *   articles            -> guru_article + taxonomy rubrik
 *   learning_materials  -> guru_materi
 *   guru_banners        -> guru_banner
 */

declare( strict_types=1 );

namespace RDG;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Post_Types {

	/**
	 * Enam rubrik dari CONSTRAINT articles_rubric_valid. Urutan dipertahankan
	 * sama dengan GURU_RUBRIC_LABEL di apps/renderer/lib/api.ts.
	 */
	public const RUBRIK = array(
		'ceritaku'     => 'Ceritaku',
		'bacaanku'     => 'Bacaanku',
		'inspirasiku'  => 'Inspirasiku',
		'bangsaku'     => 'Bangsaku',
		'peradaban'    => 'Peradaban',
		'forum-diskusi' => 'Forum Diskusi',
	);

	public static function init(): void {
		add_action( 'init', array( self::class, 'register' ) );
		add_action( 'init', array( self::class, 'seed_rubrik' ), 11 );
		add_filter( 'post_type_link', array( self::class, 'article_permalink' ), 10, 2 );
		add_filter( 'term_link', array( self::class, 'rubrik_link' ), 10, 3 );
	}

	public static function register(): void {
		self::register_rubrik();
		self::register_article();
		self::register_materi();
		self::register_banner();
		self::register_meta();
	}

	private static function register_rubrik(): void {
		register_taxonomy(
			'rubrik',
			array( 'guru_article' ),
			array(
				'labels'            => array(
					'name'          => __( 'Rubrik', 'rumah-digital-guru' ),
					'singular_name' => __( 'Rubrik', 'rumah-digital-guru' ),
				),
				'public'            => true,
				'hierarchical'      => true,
				'show_in_rest'      => true,
				'show_admin_column' => true,
				// rewrite=false: WP mengganti slug kosong dengan nama taxonomy
				// ("/rubrik/ceritaku"), padahal renderer memakai "/ceritaku".
				// Aturannya dipasang manual di Rewrites.
				'rewrite'           => false,
			)
		);
	}

	private static function register_article(): void {
		register_post_type(
			'guru_article',
			array(
				'labels'       => array(
					'name'          => __( 'Artikel', 'rumah-digital-guru' ),
					'singular_name' => __( 'Artikel', 'rumah-digital-guru' ),
					'add_new_item'  => __( 'Tulis Artikel Baru', 'rumah-digital-guru' ),
					'edit_item'     => __( 'Sunting Artikel', 'rumah-digital-guru' ),
					'not_found'     => __( 'Belum ada artikel.', 'rumah-digital-guru' ),
				),
				'public'       => true,
				'has_archive'  => false,
				'menu_icon'    => 'dashicons-edit',
				'supports'     => array( 'title', 'editor', 'excerpt', 'thumbnail', 'revisions', 'author', 'custom-fields' ),
				'taxonomies'   => array( 'rubrik', 'post_tag' ),
				'show_in_rest' => true,
				// rewrite=false + aturan eksplisit di Rewrites. URL tetap
				// /{rubrik}/{slug} seperti renderer — parity ini mengikat
				// karena Litera mencocokkan URL kanonis byte-exact.
				'rewrite'      => false,
			)
		);
	}

	private static function register_materi(): void {
		register_post_type(
			'guru_materi',
			array(
				'labels'       => array(
					'name'          => __( 'Materi Ajar', 'rumah-digital-guru' ),
					'singular_name' => __( 'Materi Ajar', 'rumah-digital-guru' ),
					'add_new_item'  => __( 'Tambah Materi Ajar', 'rumah-digital-guru' ),
					'not_found'     => __( 'Belum ada materi ajar.', 'rumah-digital-guru' ),
				),
				'public'       => true,
				'has_archive'  => 'pembelajaran',
				'menu_icon'    => 'dashicons-welcome-learn-more',
				'supports'     => array( 'title', 'editor', 'excerpt', 'thumbnail', 'revisions', 'author', 'page-attributes' ),
				'show_in_rest' => true,
				'rewrite'      => array( 'slug' => 'pembelajaran', 'with_front' => false ),
			)
		);
	}

	private static function register_banner(): void {
		register_post_type(
			'guru_banner',
			array(
				'labels'       => array(
					'name'          => __( 'Banner', 'rumah-digital-guru' ),
					'singular_name' => __( 'Banner', 'rumah-digital-guru' ),
					'not_found'     => __( 'Belum ada banner.', 'rumah-digital-guru' ),
				),
				// Banner hanya materi carousel, tidak punya halaman sendiri.
				'public'             => false,
				'show_ui'            => true,
				'publicly_queryable' => false,
				'menu_icon'          => 'dashicons-images-alt2',
				'supports'           => array( 'title', 'thumbnail', 'page-attributes' ),
				'show_in_rest'       => true,
			)
		);
	}

	/**
	 * Meta yang tidak punya padanan field bawaan WP. Semua show_in_rest supaya
	 * bisa dibaca/ditulis dari block editor.
	 */
	private static function register_meta(): void {
		$string = array(
			'type'              => 'string',
			'single'            => true,
			'show_in_rest'      => true,
			'default'           => '',
			'sanitize_callback' => 'sanitize_text_field',
			'auth_callback'     => static fn(): bool => current_user_can( 'edit_posts' ),
		);

		foreach ( array( 'guru_article', 'guru_materi' ) as $type ) {
			register_post_meta( $type, 'rdg_summary', $string );
			register_post_meta( $type, 'rdg_seo_title', $string );
			register_post_meta( $type, 'rdg_seo_description', $string );
		}

		register_post_meta( 'guru_banner', 'rdg_target_url', array_merge( $string, array( 'sanitize_callback' => 'esc_url_raw' ) ) );
		register_post_meta( 'guru_banner', 'rdg_alt_text', $string );
		register_post_meta(
			'guru_banner',
			'rdg_active',
			array(
				'type'          => 'boolean',
				'single'        => true,
				'show_in_rest'  => true,
				'default'       => true,
				'auth_callback' => static fn(): bool => current_user_can( 'edit_posts' ),
			)
		);
	}

	/**
	 * Isi taxonomy dengan 6 rubrik tetap. Idempoten — aman dipanggil tiap init.
	 * Guru boleh menambah rubrik sendiri; ini hanya menjamin yang baku ada.
	 */
	public static function seed_rubrik(): void {
		foreach ( self::RUBRIK as $slug => $label ) {
			if ( ! term_exists( $slug, 'rubrik' ) ) {
				wp_insert_term( $label, 'rubrik', array( 'slug' => $slug ) );
			}
		}
	}

	/**
	 * Bangun permalink artikel: /{rubrik}/{slug}. Dipanggil karena post type
	 * didaftarkan dengan rewrite=false, jadi WP tidak membentuknya sendiri.
	 */
	public static function article_permalink( string $link, \WP_Post $post ): string {
		if ( 'guru_article' !== $post->post_type ) {
			return $link;
		}

		$terms = get_the_terms( $post, 'rubrik' );
		// Artikel tanpa rubrik tetap harus punya URL valid, jangan 404.
		$slug = ( is_array( $terms ) && isset( $terms[0] ) ) ? $terms[0]->slug : 'lainnya';

		return home_url( user_trailingslashit( $slug . '/' . $post->post_name ) );
	}

	/**
	 * Arsip rubrik di /{slug}, bukan /rubrik/{slug}.
	 */
	public static function rubrik_link( string $link, \WP_Term $term, string $taxonomy ): string {
		if ( 'rubrik' !== $taxonomy ) {
			return $link;
		}

		return home_url( user_trailingslashit( $term->slug ) );
	}
}
