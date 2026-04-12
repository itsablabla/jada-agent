import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	plugins: [vue()],
	build: {
		outDir: 'js',
		emptyOutDir: false,
		rollupOptions: {
			input: {
				'jadaagent-main': path.resolve(__dirname, 'src/main.js'),
			},
			output: {
				format: 'iife',
				entryFileNames: '[name].js',
				chunkFileNames: '[name]-[hash].js',
				globals: {
					jquery: 'jQuery',
				},
			},
			external: ['jquery'],
		},
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
		},
	},
})
