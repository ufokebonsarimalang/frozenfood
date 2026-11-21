import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, products } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY belum dikonfigurasi di environment variables.' },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const productCatalogText = products
      .map((p: { id: string; name: string; category: string; image_hint?: string }) =>
        `ID: ${p.id} | Nama: ${p.name} | Kategori: ${p.category} | Ciri: ${p.image_hint || '-'}`
      )
      .join('\n');

    const prompt = `Anda adalah sistem kasir visual pintar untuk toko Frozen Food.
Lihat foto kemasan produk yang dikirimkan. Cocokkan produk di foto dengan daftar katalog produk berikut:
${productCatalogText}

Tugas:
1. Identifikasi produk yang paling cocok dari daftar katalog di atas.
2. Kembalikan HANYA format JSON murni tanpa markdown (\`\`\`json) dengan struktur:
{"matchedProductId": "UUID_PRODUK_ATAU_NULL", "confidence": "TINGGI/SEDANG/RENDAH", "detectedName": "Nama produk yang terlihat di kemasan"}`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: 'image/jpeg',
        },
      },
    ]);

    const responseText = result.response.text().trim();
    const cleanedJson = responseText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanedJson);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Scan Error:', error);
    return NextResponse.json(
      { error: 'Gagal memproses gambar produk.' },
      { status: 500 }
    );
  }
}