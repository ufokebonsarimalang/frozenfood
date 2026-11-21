import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, products } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          matchedProductId: null,
          confidence: 'RENDAH',
          detectedName: 'GEMINI_API_KEY kosong di .env.local',
        },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const productCatalogText = Array.isArray(products)
      ? products
          .map(
            (p: { id: string; name: string; category: string; image_hint?: string }) =>
              `- ID: "${p.id}" | Nama: "${p.name}" | Kategori: "${p.category}" | Ciri: "${p.image_hint || ''}"`
          )
          .join('\n')
      : '';

    const prompt = `Anda adalah sistem kasir visual (AI Vision) untuk toko Frozen Food.
Perhatikan foto kemasan produk yang dikirimkan. Cocokkan dengan salah satu produk dari katalog berikut:

${productCatalogText}

Kembalikan JSON dengan format persis:
{
  "matchedProductId": "ID_PRODUK_DARI_KATALOG_ATAU_NULL",
  "confidence": "TINGGI" | "SEDANG" | "RENDAH",
  "detectedName": "Nama merek & produk yang terbaca pada foto"
}`;

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
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Gagal memanggil Gemini API';
    console.error('Scan Product Error:', errMsg);
    return NextResponse.json(
      {
        matchedProductId: null,
        confidence: 'RENDAH',
        detectedName: `Detail Error: ${errMsg}`,
      },
      { status: 500 }
    );
  }
}